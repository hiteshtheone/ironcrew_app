import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { PGlite } from "@electric-sql/pglite";

import { become, migrateDatabase, scenario } from "./migrate";

const TRAINER = "11111111-1111-4111-8111-111111111111";
const CLIENT_USER = "22222222-2222-4222-8222-222222222222";
const INVITED = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

before(async () => {
  db = await migrateDatabase();
});

after(async () => {
  await db.close();
});

test("onboarding requires accepted terms, then creates the trainer or client", async () => {
  await scenario(db, async () => {
    await db.exec(`insert into auth.users (id, email) values ('${TRAINER}', 'ada@example.com')`);
    await become(db, TRAINER);
    await assert.rejects(
      () => db.query(`select public.complete_onboarding('trainer', 'Ada', 'Lovelace', 'UTC', false)`),
      /Terms and Conditions/,
    );
  });

  await scenario(db, async () => {
    await db.exec(`insert into auth.users (id, email) values ('${TRAINER}', 'ada@example.com')`);
    await become(db, TRAINER);
    await db.query(`select public.complete_onboarding('trainer', 'Ada', 'Lovelace', 'UTC', true)`);
    const profile = await db.query<{ role: string }>(`select role from public.profiles where id = '${TRAINER}'`);
    const trainer = await db.query(`select id from public.trainers where id = '${TRAINER}'`);
    assert.equal(profile.rows[0]?.role, "trainer");
    assert.equal(trainer.rows.length, 1);
  });

  await scenario(db, async () => {
    await db.exec(`insert into auth.users (id, email) values ('${CLIENT_USER}', 'grace@example.com')`);
    await become(db, CLIENT_USER);
    const created = await db.query<{ complete_onboarding: { client_id: string } }>(
      `select public.complete_onboarding('client', 'Grace', 'Hopper', 'UTC', true)`,
    );
    const clientId = created.rows[0]?.complete_onboarding.client_id;
    const client = await db.query<{ profile_id: string }>(
      `select profile_id from public.clients where id = '${clientId}'`,
    );
    assert.equal(client.rows[0]?.profile_id, CLIENT_USER);
  });
});

test("an invited client is linked by email, and an unknown email is left alone", async () => {
  await scenario(db, async () => {
    await seedTrainer(db);
    await db.exec(
      `insert into auth.users (id, email) values ('${INVITED}', 'invited@example.com')`,
    );
    const client = await db.query<{ id: string }>(
      `insert into public.clients (first_name, email) values ('Invited', 'invited@example.com') returning id`,
    );
    await db.exec(
      `insert into public.trainer_clients (trainer_id, client_id) values ('${TRAINER}', '${client.rows[0]?.id}')`,
    );
    await become(db, INVITED);
    const claimed = await db.query<{ claim_invited_client: boolean }>(`select public.claim_invited_client()`);
    assert.equal(claimed.rows[0]?.claim_invited_client, true);
    const linked = await db.query<{ profile_id: string }>(
      `select profile_id from public.clients where id = '${client.rows[0]?.id}'`,
    );
    assert.equal(linked.rows[0]?.profile_id, INVITED);
  });

  await scenario(db, async () => {
    await db.exec(`insert into auth.users (id, email) values ('${INVITED}', 'new@example.com')`);
    await become(db, INVITED);
    const claimed = await db.query<{ claim_invited_client: boolean }>(`select public.claim_invited_client()`);
    assert.equal(claimed.rows[0]?.claim_invited_client, false);
  });
});

test("a second program start is refused, and only an explicit first week is published", async () => {
  await scenario(db, async () => {
    const first = await seedClientProgram(db, "Build");
    const both = await seedClientProgram(db, "Peak", first);
    await become(db, CLIENT_USER);
    await db.query(
      `select public.start_own_program('${both.programs[0]}', '2026-11-16', 'Run', 'endurance', false, false)`,
    );
    await db.exec("savepoint overlap");
    await assert.rejects(
      () =>
        db.query(
          `select public.start_own_program('${both.programs[1]}', '2026-11-16', 'Peak', 'endurance', false, false)`,
        ),
      /ACTIVE_PROGRAM_EXISTS/,
    );
    await db.exec("rollback to savepoint overlap");
    const quiet = await db.query<{ n: number }>(
      `select count(*)::int as n from public.workout_assignments where client_id = '${both.clientId}'`,
    );
    assert.equal(quiet.rows[0]?.n, 0);
  });

  await scenario(db, async () => {
    const seeded = await seedClientProgram(db, "Build");
    await become(db, CLIENT_USER);
    await db.query(
      `select public.start_own_program('${seeded.programs[0]}', '2026-11-16', null, 'other', false, true)`,
    );
    const published = await db.query<{ n: number }>(
      `select count(*)::int as n from public.workout_assignments where client_id = '${seeded.clientId}'`,
    );
    assert.equal(published.rows[0]?.n, 1);
  });
});

test("deactivating a program cancels upcoming workouts and keeps completed ones", async () => {
  await scenario(db, async () => {
    const seeded = await seedClientProgram(db, "Build");
    await become(db, CLIENT_USER);
    const started = await db.query<{ start_own_program: { program_assignment_id: string } }>(
      `select public.start_own_program('${seeded.programs[0]}', current_date, null, 'other', false, false)`,
    );
    const assignmentId = started.rows[0]?.start_own_program.program_assignment_id;
    await db.exec(`
      insert into public.workout_assignments (
        client_id, workout_id, program_assignment_id, assigned_by_client_id, scheduled_for, status
      ) values
        ('${seeded.clientId}', '${seeded.workoutId}', '${assignmentId}', '${seeded.clientId}', current_date, 'completed'),
        ('${seeded.clientId}', '${seeded.workoutId}', '${assignmentId}', '${seeded.clientId}', current_date + 1, 'scheduled')
    `);
    await db.query(`select public.deactivate_program('${seeded.programs[0]}', '${seeded.clientId}')`);
    const rows = await db.query<{ status: string; scheduled_for: string }>(
      `select status, scheduled_for::text from public.workout_assignments where client_id = '${seeded.clientId}' order by scheduled_for`,
    );
    assert.deepEqual(
      rows.rows.map((row) => row.status),
      ["completed", "cancelled"],
    );
  });
});

test("export returns the profile, and delete refuses a trainer who still has clients", async () => {
  await scenario(db, async () => {
    await seedTrainer(db);
    const client = await db.query<{ id: string }>(
      `insert into public.clients (first_name) values ('Lifter') returning id`,
    );
    await db.exec(
      `insert into public.trainer_clients (trainer_id, client_id) values ('${TRAINER}', '${client.rows[0]?.id}')`,
    );
    await become(db, TRAINER);
    const exported = await db.query<{ export_own_account: { profile: { role: string } } }>(
      `select public.export_own_account()`,
    );
    assert.equal(exported.rows[0]?.export_own_account.profile.role, "trainer");
    await assert.rejects(() => db.query(`select public.delete_own_account()`), /ACCOUNT_HAS_CLIENTS/);
  });

  await scenario(db, async () => {
    await db.exec(`insert into auth.users (id, email) values ('${CLIENT_USER}', 'grace@example.com')`);
    await become(db, CLIENT_USER);
    await db.query(`select public.complete_onboarding('client', 'Grace', null, 'UTC', true)`);
    await db.query(`select public.delete_own_account()`);
    await db.exec("reset role");
    const profile = await db.query(`select id from public.profiles where id = '${CLIENT_USER}'`);
    const authUser = await db.query(`select id from auth.users where id = '${CLIENT_USER}'`);
    assert.equal(profile.rows.length, 0);
    assert.equal(authUser.rows.length, 0);
  });
});

test("saving a workout keeps the block id that a logged set points at", async () => {
  await scenario(db, async () => {
    await seedTrainer(db);
    const workout = await db.query<{ id: string }>(
      `insert into public.workouts (trainer_id, name) values ('${TRAINER}', 'Upper') returning id`,
    );
    const exercise = await db.query<{ id: string }>(
      `insert into public.exercises (trainer_id, name, tracking_type, tracking_parameters)
       values ('${TRAINER}', 'Bench', 'weight_reps', '{weight,reps}') returning id`,
    );
    const block = await db.query<{ id: string }>(
      `insert into public.workout_blocks (workout_id, exercise_id, block_type, position)
       values ('${workout.rows[0]?.id}', '${exercise.rows[0]?.id}', 'exercise', 1) returning id`,
    );
    const client = await db.query<{ id: string }>(
      `insert into public.clients (first_name) values ('Lifter') returning id`,
    );
    await db.exec(
      `insert into public.trainer_clients (trainer_id, client_id) values ('${TRAINER}', '${client.rows[0]?.id}')`,
    );
    const session = await db.query<{ id: string }>(
      `insert into public.workout_sessions (client_id, workout_id, status, completed_at)
       values ('${client.rows[0]?.id}', '${workout.rows[0]?.id}', 'completed', now()) returning id`,
    );
    await db.exec(
      `insert into public.exercise_results (workout_session_id, workout_block_id, exercise_id, set_number, repetitions)
       values ('${session.rows[0]?.id}', '${block.rows[0]?.id}', '${exercise.rows[0]?.id}', 1, 8)`,
    );
    await become(db, TRAINER);
    const blocks = JSON.stringify([
      { id: block.rows[0]?.id, block_type: "exercise", exercise_id: exercise.rows[0]?.id, prescribed_sets: 3 },
    ]).replaceAll("'", "''");
    await db.query(
      `select public.save_workout('${workout.rows[0]?.id}', 'Upper updated', null, null, '${blocks}'::jsonb)`,
    );
    const kept = await db.query<{ workout_block_id: string }>(
      `select workout_block_id from public.exercise_results where workout_session_id = '${session.rows[0]?.id}'`,
    );
    assert.equal(kept.rows[0]?.workout_block_id, block.rows[0]?.id);
  });
});

test("a client can complete a workout and cannot cancel it", async () => {
  await scenario(db, async () => {
    await seedTrainer(db);
    await db.exec(`
      insert into auth.users (id, email) values ('${CLIENT_USER}', 'grace@example.com');
      insert into public.profiles (id, role, full_name) values ('${CLIENT_USER}', 'client', 'Grace Hopper');
    `);
    const client = await db.query<{ id: string }>(
      `insert into public.clients (first_name, profile_id) values ('Grace', '${CLIENT_USER}') returning id`,
    );
    await db.exec(
      `insert into public.trainer_clients (trainer_id, client_id) values ('${TRAINER}', '${client.rows[0]?.id}')`,
    );
    const workout = await db.query<{ id: string }>(
      `insert into public.workouts (trainer_id, name) values ('${TRAINER}', 'Day') returning id`,
    );
    const assignment = await db.query<{ id: string }>(
      `insert into public.workout_assignments (client_id, workout_id, assigned_by_trainer_id, scheduled_for)
       values ('${client.rows[0]?.id}', '${workout.rows[0]?.id}', '${TRAINER}', current_date) returning id`,
    );
    await become(db, CLIENT_USER);
    await db.exec(
      `update public.workout_assignments set status = 'completed' where id = '${assignment.rows[0]?.id}'`,
    );
    await assert.rejects(
      () => db.exec(`update public.workout_assignments set status = 'cancelled' where id = '${assignment.rows[0]?.id}'`),
      /cannot cancel/i,
    );
  });
});

test("tracking parameters and repeated muscles are rejected", async () => {
  await scenario(db, async () => {
    await assert.rejects(
      () =>
        db.exec(
          `insert into public.exercises (name, tracking_type, tracking_parameters)
           values ('Bad track', 'weight_reps', '{time}')`,
        ),
      /check/i,
    );
  });
  await scenario(db, async () => {
    await assert.rejects(
      () =>
        db.exec(
          `insert into public.exercises (name, tracking_type, tracking_parameters, primary_muscle_group, secondary_muscle_groups)
           values ('Bad muscle', 'weight_reps', '{weight,reps}', 'chest', '{chest}')`,
        ),
      /check/i,
    );
  });
});

async function seedTrainer(db: PGlite) {
  await db.exec(`
    insert into auth.users (id, email) values ('${TRAINER}', 'ada@example.com');
    insert into public.profiles (id, role, full_name, terms_accepted_at)
      values ('${TRAINER}', 'trainer', 'Ada Lovelace', now());
    insert into public.trainers (id, first_name, last_name) values ('${TRAINER}', 'Ada', 'Lovelace');
  `);
}

type ClientProgram = { clientId: string; workoutId: string; programs: string[] };

async function seedClientProgram(db: PGlite, programName: string, existing?: ClientProgram): Promise<ClientProgram> {
  let clientId = existing?.clientId;
  let workoutId = existing?.workoutId;
  if (!clientId || !workoutId) {
    await db.exec(`
      insert into auth.users (id, email) values ('${CLIENT_USER}', 'grace@example.com');
      insert into public.profiles (id, role, full_name, timezone, terms_accepted_at)
        values ('${CLIENT_USER}', 'client', 'Grace Hopper', 'UTC', now());
    `);
    const client = await db.query<{ id: string }>(
      `insert into public.clients (profile_id, first_name, email)
       values ('${CLIENT_USER}', 'Grace', 'grace@example.com') returning id`,
    );
    clientId = client.rows[0]?.id;
    const workout = await db.query<{ id: string }>(
      `insert into public.workouts (owner_client_id, name) values ('${clientId}', 'Easy run') returning id`,
    );
    workoutId = workout.rows[0]?.id;
  }

  const program = await db.query<{ id: string }>(
    `insert into public.programs (owner_client_id, name) values ('${clientId}', '${programName}') returning id`,
  );
  const phase = await db.query<{ id: string }>(
    `insert into public.program_phases (program_id, name, position)
     values ('${program.rows[0]?.id}', 'Base', 1) returning id`,
  );
  const week = await db.query<{ id: string }>(
    `insert into public.program_weeks (program_phase_id, week_number) values ('${phase.rows[0]?.id}', 1) returning id`,
  );
  await db.exec(
    `insert into public.program_workouts (program_week_id, workout_id, day_number)
     values ('${week.rows[0]?.id}', '${workoutId}', 1)`,
  );
  return { clientId: clientId!, workoutId: workoutId!, programs: [...(existing?.programs ?? []), program.rows[0]!.id] };
}
