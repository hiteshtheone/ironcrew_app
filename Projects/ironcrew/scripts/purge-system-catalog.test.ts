import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { purgeSystemCatalog, type SqlClient } from "./purge-system-catalog";

const trainerId = "11111111-1111-4111-8111-111111111111";
const loggedExerciseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const unusedExerciseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ownedExerciseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const loggedWorkoutId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const unloggedWorkoutId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const ownedWorkoutId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
const systemProgramId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const ownedProgramId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const loggedBlockId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const unloggedBlockId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const ownedSystemBlockId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const ownedBlockId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const systemSlotId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const ownedSlotId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const systemAssignmentId = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const ownedAssignmentId = "ffffffff-ffff-4fff-8fff-fffffffffff2";
const loggedSessionId = "12121212-1212-4121-8121-121212121211";
const ownedSessionId = "12121212-1212-4121-8121-121212121212";
const loggedResultId = "13131313-1313-4131-8131-131313131311";
const ownedResultId = "13131313-1313-4131-8131-131313131312";

const schema = `
create table public.exercises (
  id uuid primary key,
  trainer_id uuid,
  owner_client_id uuid,
  name text not null
);

create table public.workouts (
  id uuid primary key,
  trainer_id uuid,
  owner_client_id uuid,
  name text not null
);

create table public.programs (
  id uuid primary key,
  trainer_id uuid,
  owner_client_id uuid,
  name text not null
);

create table public.workout_blocks (
  id uuid primary key,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  block_type text not null,
  position integer not null,
  check (block_type <> 'exercise' or exercise_id is not null)
);

create table public.program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  name text not null
);

create table public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_phase_id uuid not null references public.program_phases(id) on delete cascade
);

create table public.program_workouts (
  id uuid primary key,
  program_week_id uuid not null references public.program_weeks(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete restrict
);

create table public.workout_assignments (
  id uuid primary key,
  workout_id uuid not null references public.workouts(id) on delete restrict,
  program_workout_id uuid references public.program_workouts(id) on delete set null
);

create table public.workout_sessions (
  id uuid primary key,
  workout_assignment_id uuid references public.workout_assignments(id) on delete set null,
  workout_id uuid not null references public.workouts(id) on delete restrict
);

create table public.exercise_results (
  id uuid primary key,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  workout_block_id uuid references public.workout_blocks(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  set_number integer not null
);
`;

test("purge removes the unlogged system catalog and keeps logged system workouts", async () => {
  const db = await database();
  await seed(db);

  const counts = await purgeSystemCatalog(clientFor(db));

  assert.deepEqual(counts, {
    exerciseResults: 1,
    workoutAssignments: 1,
    programSlots: 2,
    workoutBlocks: 1,
    programs: 1,
    workouts: 1,
    exercises: 1,
    keptWorkouts: 1,
    keptExercises: 1,
  });

  const loggedSession = await db.query<{ workout_id: string; workout_assignment_id: string | null }>(
    `select workout_id, workout_assignment_id from public.workout_sessions where id = $1`,
    [loggedSessionId],
  );
  assert.equal(loggedSession.rows[0]?.workout_id, loggedWorkoutId);
  assert.equal(loggedSession.rows[0]?.workout_assignment_id, null);

  const loggedResult = await db.query<{ exercise_id: string; workout_block_id: string }>(
    `select exercise_id, workout_block_id from public.exercise_results where id = $1`,
    [loggedResultId],
  );
  assert.equal(loggedResult.rows[0]?.exercise_id, loggedExerciseId);
  assert.equal(loggedResult.rows[0]?.workout_block_id, loggedBlockId);

  const remaining = await db.query<{ kind: string; name: string }>(`
    select 'exercise' as kind, name from public.exercises
    union all select 'workout', name from public.workouts
    union all select 'program', name from public.programs
    union all select 'block', id::text from public.workout_blocks
    union all select 'slot', id::text from public.program_workouts
    union all select 'assignment', id::text from public.workout_assignments
    union all select 'session', id::text from public.workout_sessions
    union all select 'result', id::text from public.exercise_results
    order by kind, name
  `);
  assert.deepEqual(
    remaining.rows.map((row) => `${row.kind}:${row.name}`),
    [
      `assignment:${ownedAssignmentId}`,
      `block:${loggedBlockId}`,
      `block:${ownedBlockId}`,
      "exercise:Owned Press",
      "exercise:Squat",
      "program:Owned Plan",
      `result:${loggedResultId}`,
      `session:${loggedSessionId}`,
      `session:${ownedSessionId}`,
      "workout:Owned Day",
      "workout:System Day",
    ],
  );

  const ownedWeek = await db.query(
    `select week.id
     from public.program_weeks as week
     join public.program_phases as phase on phase.id = week.program_phase_id
     where phase.program_id = $1`,
    [ownedProgramId],
  );
  assert.equal(ownedWeek.rows.length, 1);
  const systemPhase = await db.query(`select id from public.program_phases where program_id = $1`, [systemProgramId]);
  assert.equal(systemPhase.rows.length, 0);
});

async function database() {
  const db = new PGlite();
  await db.exec(schema);
  return db;
}

function clientFor(db: PGlite): SqlClient {
  return {
    query: async (text, values) => db.query(text, values),
  };
}

async function seed(db: PGlite) {
  await db.exec(`
    insert into public.exercises (id, trainer_id, name) values
      ('${loggedExerciseId}', null, 'Squat'),
      ('${unusedExerciseId}', null, 'Curl'),
      ('${ownedExerciseId}', '${trainerId}', 'Owned Press');

    insert into public.workouts (id, trainer_id, name) values
      ('${loggedWorkoutId}', null, 'System Day'),
      ('${unloggedWorkoutId}', null, 'System Extra'),
      ('${ownedWorkoutId}', '${trainerId}', 'Owned Day');

    insert into public.programs (id, trainer_id, name) values
      ('${systemProgramId}', null, 'System Plan'),
      ('${ownedProgramId}', '${trainerId}', 'Owned Plan');

    insert into public.workout_blocks (id, workout_id, exercise_id, block_type, position) values
      ('${loggedBlockId}', '${loggedWorkoutId}', '${loggedExerciseId}', 'exercise', 1),
      ('${unloggedBlockId}', '${unloggedWorkoutId}', null, 'notes', 1),
      ('${ownedSystemBlockId}', '${ownedWorkoutId}', '${unusedExerciseId}', 'exercise', 1),
      ('${ownedBlockId}', '${ownedWorkoutId}', '${ownedExerciseId}', 'exercise', 2);

    insert into public.program_phases (id, program_id, name) values
      ('14141414-1414-4141-8141-141414141411', '${systemProgramId}', 'Base'),
      ('14141414-1414-4141-8141-141414141412', '${ownedProgramId}', 'Base');

    insert into public.program_weeks (id, program_phase_id) values
      ('15151515-1515-4151-8151-151515151511', '14141414-1414-4141-8141-141414141411'),
      ('15151515-1515-4151-8151-151515151512', '14141414-1414-4141-8141-141414141412');

    insert into public.program_workouts (id, program_week_id, workout_id) values
      ('${systemSlotId}', '15151515-1515-4151-8151-151515151511', '${loggedWorkoutId}'),
      ('${ownedSlotId}', '15151515-1515-4151-8151-151515151512', '${loggedWorkoutId}');

    insert into public.workout_assignments (id, workout_id, program_workout_id) values
      ('${systemAssignmentId}', '${loggedWorkoutId}', '${ownedSlotId}'),
      ('${ownedAssignmentId}', '${ownedWorkoutId}', null);

    insert into public.workout_sessions (id, workout_assignment_id, workout_id) values
      ('${loggedSessionId}', '${systemAssignmentId}', '${loggedWorkoutId}'),
      ('${ownedSessionId}', '${ownedAssignmentId}', '${ownedWorkoutId}');

    insert into public.exercise_results (id, workout_session_id, workout_block_id, exercise_id, set_number) values
      ('${loggedResultId}', '${loggedSessionId}', '${loggedBlockId}', '${loggedExerciseId}', 1),
      ('${ownedResultId}', '${ownedSessionId}', '${ownedSystemBlockId}', '${unusedExerciseId}', 1);
  `);
}
