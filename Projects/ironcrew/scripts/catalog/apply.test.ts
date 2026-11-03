import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { applyDocument, type SqlClient } from "./apply";
import { CatalogError, parseCatalog, type CatalogDocument } from "./document";

const schema = `
create type public.program_status as enum ('draft', 'active', 'archived');
create type public.workout_block_type as enum ('warmup', 'exercise', 'superset', 'circuit', 'conditioning', 'cooldown', 'notes');
create type public.exercise_tracking_type as enum (
  'time', 'reps', 'weight', 'weight_reps', 'distance', 'distance_weight', 'distance_time', 'reps_height', 'custom'
);
create type public.exercise_tracking_parameter as enum ('time', 'reps', 'weight', 'distance', 'height');

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid,
  owner_client_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  instructions text,
  primary_muscle_group text,
  equipment text,
  video_url text,
  secondary_muscle_group text,
  tracking_type public.exercise_tracking_type not null default 'custom',
  tracking_parameters public.exercise_tracking_parameter[] not null
    default array['weight', 'reps', 'time', 'distance']::public.exercise_tracking_parameter[],
  constraint exercises_at_most_one_owner check (num_nonnulls(trainer_id, owner_client_id) <= 1)
);
create unique index exercises_owner_name_key on public.exercises (trainer_id, owner_client_id, name) nulls not distinct;

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid,
  owner_client_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  estimated_duration_minutes integer check (estimated_duration_minutes > 0),
  is_template boolean not null default true,
  constraint workouts_at_most_one_owner check (num_nonnulls(trainer_id, owner_client_id) <= 1)
);
create unique index workouts_shared_name_key on public.workouts (name) where trainer_id is null and owner_client_id is null;

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid,
  owner_client_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  status public.program_status not null default 'draft',
  estimated_duration_weeks integer check (estimated_duration_weeks > 0),
  constraint programs_at_most_one_owner check (num_nonnulls(trainer_id, owner_client_id) <= 1)
);
create unique index programs_shared_name_key on public.programs (name) where trainer_id is null and owner_client_id is null;

create table public.workout_blocks (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  block_type public.workout_block_type not null,
  position integer not null check (position > 0),
  title text,
  prescribed_sets integer check (prescribed_sets > 0),
  prescribed_reps_min integer check (prescribed_reps_min > 0),
  prescribed_reps_max integer check (prescribed_reps_max >= prescribed_reps_min),
  prescribed_load numeric(10,3) check (prescribed_load >= 0),
  load_unit text,
  rest_seconds integer check (rest_seconds >= 0),
  tempo text,
  rpe_target numeric(3,1) check (rpe_target between 0 and 10),
  instructions text,
  configuration jsonb not null default '{}'::jsonb,
  prescribed_duration_seconds integer check (prescribed_duration_seconds is null or prescribed_duration_seconds >= 0),
  prescribed_distance_meters numeric(12,2) check (prescribed_distance_meters is null or prescribed_distance_meters >= 0),
  prescribed_height_cm numeric(8,2) check (prescribed_height_cm is null or prescribed_height_cm >= 0),
  unique (workout_id, position),
  check (block_type <> 'exercise' or exercise_id is not null)
);

create table public.program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  position integer not null check (position > 0),
  description text,
  unique (program_id, position)
);

create table public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_phase_id uuid not null references public.program_phases(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  name text,
  notes text,
  unique (program_phase_id, week_number)
);

create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_week_id uuid not null references public.program_weeks(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete restrict,
  day_number integer not null check (day_number between 1 and 7),
  position integer not null default 1 check (position > 0),
  title_override text,
  notes text,
  unique (program_week_id, day_number, position)
);

create or replace function public.guard_system_workout_block()
returns trigger language plpgsql as $$
declare
  v_system boolean;
begin
  select w.trainer_id is null and w.owner_client_id is null into v_system
  from public.workouts w where w.id = new.workout_id;
  if coalesce(v_system, false) and new.exercise_id is not null and not exists (
    select 1 from public.exercises e
    where e.id = new.exercise_id and e.trainer_id is null and e.owner_client_id is null
  ) then
    raise exception 'A system workout can only include system exercises';
  end if;
  return new;
end $$;

create trigger workout_blocks_guard_system
  before insert or update of workout_id, exercise_id on public.workout_blocks
  for each row execute function public.guard_system_workout_block();

create or replace function public.guard_system_program_slot()
returns trigger language plpgsql as $$
declare
  v_system boolean;
begin
  select p.trainer_id is null and p.owner_client_id is null into v_system
  from public.program_weeks pw
  join public.program_phases pp on pp.id = pw.program_phase_id
  join public.programs p on p.id = pp.program_id
  where pw.id = new.program_week_id;
  if coalesce(v_system, false) and not exists (
    select 1 from public.workouts w
    where w.id = new.workout_id and w.trainer_id is null and w.owner_client_id is null
  ) then
    raise exception 'A system program can only include system workouts';
  end if;
  return new;
end $$;

create trigger program_workouts_guard_system
  before insert or update of program_week_id, workout_id on public.program_workouts
  for each row execute function public.guard_system_program_slot();
`;

const sample = {
  exercises: [{ name: "Bench Press", muscle: "chest", equipment: "barbell" }],
  workouts: [
    {
      name: "Push A",
      minutes: 60,
      blocks: [{ exercise: "Bench Press", sets: 4, reps: "6-8", rest: 120, load: 60, unit: "kg" }],
    },
  ],
  programs: [
    {
      name: "Push Pull",
      phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout: "Push A" }] }] }],
    },
  ],
};

test("apply upserts shared rows and keeps their ids", async () => {
  const db = await database();
  const first = await applyInTransaction(db, parseCatalog(sample), "sample.yaml");
  assert.deepEqual(first, {
    exercises: { created: 1, updated: 0 },
    workouts: { created: 1, updated: 0 },
    programs: { created: 1, updated: 0 },
  });

  const before = await snapshot(db);
  const revised = parseCatalog({
    ...sample,
    exercises: [{ name: "Bench Press", muscle: "chest", equipment: "dumbbell", description: "Press" }],
    workouts: [
      {
        name: "Push A",
        minutes: 45,
        blocks: [
          { exercise: "Bench Press", sets: 3, reps: 8, rest: 90 },
          { type: "notes", title: "Easy" },
        ],
      },
    ],
  });
  const second = await applyInTransaction(db, revised, "sample.yaml");
  assert.equal(second.exercises.updated, 1);
  assert.equal(second.workouts.updated, 1);
  assert.equal(second.programs.updated, 1);

  const after = await snapshot(db);
  assert.equal(after.exerciseId, before.exerciseId);
  assert.equal(after.workoutId, before.workoutId);
  assert.equal(after.programId, before.programId);
  assert.equal(after.equipment, "dumbbell");
  assert.equal(after.minutes, 45);
  assert.equal(after.blockCount, 2);
  assert.equal(after.repsMin, 8);
  assert.equal(after.repsMax, 8);
  assert.equal(after.ownersNull, true);
  assert.equal(after.programCount, 1);
});

test("a private exercise with the same name is not reused", async () => {
  const db = await database();
  await db.query(
    `insert into public.exercises (trainer_id, name) values ('11111111-1111-4111-8111-111111111111', 'Bench Press')`,
  );
  await applyInTransaction(db, parseCatalog(sample), "sample.yaml");
  const rows = await db.query<{ shared: boolean }>(`select trainer_id is null as shared from public.exercises where name = 'Bench Press' order by shared`);
  assert.deepEqual(
    rows.rows.map((row) => row.shared),
    [false, true],
  );
});

test("an unknown workout is rejected before any new rows are written", async () => {
  const db = await database();
  await assert.rejects(
    () =>
      applyInTransaction(
        db,
        parseCatalog({
          exercises: [{ name: "Bench Press" }],
          programs: [{ name: "Push Pull", phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout: "Missing" }] }] }] }],
        }),
        "sample.yaml",
      ),
    (error: unknown) => error instanceof CatalogError && /unknown workout "Missing"/.test(error.message),
  );
  const exercises = await db.query(`select id from public.exercises`);
  const programs = await db.query(`select id from public.programs`);
  assert.equal(exercises.rows.length, 0);
  assert.equal(programs.rows.length, 0);
});

test("a failed write rolls back the catalog file", async () => {
  const db = await database();
  await db.exec(`
    create or replace function public.fail_named_workout()
    returns trigger language plpgsql as $$
    begin
      if new.name = 'Push A' then
        raise exception 'forced failure';
      end if;
      return new;
    end $$;
    create trigger workouts_fail_named before insert on public.workouts
      for each row execute function public.fail_named_workout();
  `);
  await assert.rejects(() => applyInTransaction(db, parseCatalog(sample), "sample.yaml"), /forced failure/);
  const exercises = await db.query(`select id from public.exercises`);
  assert.equal(exercises.rows.length, 0);
});

test("a workout can use a shared exercise that is already in the catalog", async () => {
  const db = await database();
  await applyInTransaction(db, parseCatalog({ exercises: [{ name: "Bench Press", muscle: "chest" }] }), "exercises.yaml");
  const counts = await applyInTransaction(
    db,
    parseCatalog({ workouts: [{ name: "Push A", blocks: [{ exercise: "Bench Press", sets: 5, reps: 5 }] }] }),
    "workouts.yaml",
  );
  assert.equal(counts.exercises.created, 0);
  assert.equal(counts.workouts.created, 1);
  const blocks = await db.query<{ name: string }>(
    `select e.name from public.workout_blocks b join public.exercises e on e.id = b.exercise_id`,
  );
  assert.equal(blocks.rows[0]?.name, "Bench Press");
});

test("a program file can use workout and exercise ids without repeating them", async () => {
  const db = await database();
  const exerciseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workoutId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await applyInTransaction(
    db,
    parseCatalog({
      exercises: [{ id: exerciseId, name: "Bench Press", muscle: "chest" }],
      workouts: [{ id: workoutId, name: "Push A", blocks: [{ exercise_id: exerciseId, sets: 4, reps: 5 }] }],
    }),
    "library.yaml",
  );

  const counts = await applyInTransaction(
    db,
    parseCatalog({
      programs: [{ name: "Push Pull", phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout_id: workoutId }] }] }] }],
    }),
    "program.yaml",
  );
  assert.deepEqual(counts, {
    exercises: { created: 0, updated: 0 },
    workouts: { created: 0, updated: 0 },
    programs: { created: 1, updated: 0 },
  });

  const slots = await db.query<{ workout_id: string }>(
    `select workout_id::text as workout_id from public.program_workouts`,
  );
  assert.equal(slots.rows[0]?.workout_id, workoutId);

  const renamed = await applyInTransaction(
    db,
    parseCatalog({ exercises: [{ id: exerciseId, name: "Bench Press Wide" }] }),
    "rename.yaml",
  );
  assert.equal(renamed.exercises.updated, 1);
  const names = await db.query<{ name: string }>(`select name from public.exercises`);
  assert.deepEqual(names.rows.map((row) => row.name), ["Bench Press Wide"]);
});

test("an unknown workout id is rejected before any rows are written", async () => {
  const db = await database();
  await assert.rejects(
    () =>
      applyInTransaction(
        db,
        parseCatalog({
          exercises: [{ name: "Bench Press" }],
          programs: [
            {
              name: "Push Pull",
              phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] }] }],
            },
          ],
        }),
        "program.yaml",
      ),
    /unknown workout id bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/,
  );
  const exercises = await db.query(`select id from public.exercises`);
  assert.equal(exercises.rows.length, 0);
});

test("apply stores every content column and keeps omitted tracking on update", async () => {
  const db = await database();
  const full = parseCatalog({
    exercises: [
      {
        name: "Bench Press",
        primary_muscle_group: "chest",
        secondary_muscle_group: "triceps",
        tracking_type: "weight_reps",
        instructions: "Brace",
      },
    ],
    workouts: [
      {
        name: "Push A",
        estimated_duration_minutes: 45,
        is_template: false,
        blocks: [
          {
            exercise: "Bench Press",
            prescribed_sets: 4,
            prescribed_reps_min: 6,
            prescribed_reps_max: 8,
            prescribed_load: 60.5,
            load_unit: "kg",
            rest_seconds: 90,
            tempo: "31X1",
            rpe_target: 8.5,
            instructions: "Pause",
            configuration: { grip: "medium" },
            prescribed_duration_seconds: 3,
            prescribed_distance_meters: 1.25,
            prescribed_height_cm: 40,
          },
        ],
      },
    ],
    programs: [
      {
        name: "Push Pull",
        status: "active",
        estimated_duration_weeks: 10,
        phases: [
          {
            name: "Peak",
            position: 2,
            weeks: [
              {
                name: "Heavy",
                week_number: 3,
                notes: "Leave a rep",
                days: [{ day_number: 2, workout: "Push A", position: 4, title_override: "Push", notes: "First" }],
              },
            ],
          },
        ],
      },
    ],
  });
  await applyInTransaction(db, full, "full.yaml");

  const stored = await db.query<{
    secondary_muscle_group: string;
    tracking_type: string;
    tracking_parameters: string[];
    is_template: boolean;
    minutes: number;
    tempo: string;
    rpe_target: string;
    configuration: { grip: string };
    duration_seconds: number;
    distance_meters: string;
    height_cm: string;
    estimated_duration_weeks: number;
    phase_position: number;
    week_number: number;
    week_notes: string;
    day_number: number;
    slot_position: number;
    title_override: string;
    slot_notes: string;
  }>(`
    select
      e.secondary_muscle_group,
      e.tracking_type::text as tracking_type,
      e.tracking_parameters::text[] as tracking_parameters,
      w.is_template,
      w.estimated_duration_minutes as minutes,
      b.tempo,
      b.rpe_target::text as rpe_target,
      b.configuration,
      b.prescribed_duration_seconds as duration_seconds,
      b.prescribed_distance_meters::text as distance_meters,
      b.prescribed_height_cm::text as height_cm,
      p.estimated_duration_weeks,
      pp.position as phase_position,
      pw.week_number,
      pw.notes as week_notes,
      slot.day_number,
      slot.position as slot_position,
      slot.title_override,
      slot.notes as slot_notes
    from public.exercises e
    join public.workout_blocks b on b.exercise_id = e.id
    join public.workouts w on w.id = b.workout_id
    join public.programs p on p.name = 'Push Pull'
    join public.program_phases pp on pp.program_id = p.id
    join public.program_weeks pw on pw.program_phase_id = pp.id
    join public.program_workouts slot on slot.program_week_id = pw.id
  `);
  const row = stored.rows[0];
  assert.ok(row);
  assert.equal(row.secondary_muscle_group, "triceps");
  assert.equal(row.tracking_type, "weight_reps");
  assert.deepEqual(row.tracking_parameters, ["weight", "reps"]);
  assert.equal(row.is_template, false);
  assert.equal(row.minutes, 45);
  assert.equal(row.tempo, "31X1");
  assert.equal(row.rpe_target, "8.5");
  assert.deepEqual(row.configuration, { grip: "medium" });
  assert.equal(row.duration_seconds, 3);
  assert.equal(row.distance_meters, "1.25");
  assert.equal(row.height_cm, "40.00");
  assert.equal(row.estimated_duration_weeks, 10);
  assert.equal(row.phase_position, 2);
  assert.equal(row.week_number, 3);
  assert.equal(row.week_notes, "Leave a rep");
  assert.equal(row.day_number, 2);
  assert.equal(row.slot_position, 4);
  assert.equal(row.title_override, "Push");
  assert.equal(row.slot_notes, "First");

  await applyInTransaction(
    db,
    parseCatalog({ exercises: [{ name: "Bench Press", muscle: "chest", equipment: "dumbbell" }] }),
    "keep-tracking.yaml",
  );
  const kept = await db.query<{ tracking_type: string; secondary_muscle_group: string | null }>(
    `select tracking_type::text as tracking_type, secondary_muscle_group from public.exercises where name = 'Bench Press'`,
  );
  assert.equal(kept.rows[0]?.tracking_type, "weight_reps");
  assert.equal(kept.rows[0]?.secondary_muscle_group, null);
});

test("a private workout id cannot be placed on a catalog program", async () => {
  const db = await database();
  const workoutId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await db.query(
    `insert into public.workouts (id, trainer_id, name) values ($1, '11111111-1111-4111-8111-111111111111', 'Push A')`,
    [workoutId],
  );
  await assert.rejects(
    () =>
      applyInTransaction(
        db,
        parseCatalog({
          programs: [{ name: "Push Pull", phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout_id: workoutId }] }] }] }],
        }),
        "program.yaml",
      ),
    /is not in the shared catalog/,
  );
  const programs = await db.query(`select id from public.programs`);
  assert.equal(programs.rows.length, 0);
});

async function database() {
  const db = new PGlite();
  await db.exec(schema);
  return db;
}

async function applyInTransaction(db: PGlite, document: CatalogDocument, label: string) {
  const client: SqlClient = {
    query: async (text, values) => db.query(text, values),
  };
  await client.query("begin");
  try {
    const counts = await applyDocument(client, document, label);
    await client.query("commit");
    return counts;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function snapshot(db: PGlite) {
  const rows = await db.query<{
    exercise_id: string;
    workout_id: string;
    program_id: string;
    equipment: string;
    minutes: number;
    block_count: number;
    reps_min: number;
    reps_max: number;
    owners_null: boolean;
    program_count: number;
  }>(`
    select
      e.id as exercise_id,
      w.id as workout_id,
      p.id as program_id,
      e.equipment,
      w.estimated_duration_minutes as minutes,
      (select count(*)::int from public.workout_blocks b where b.workout_id = w.id) as block_count,
      (select prescribed_reps_min from public.workout_blocks b where b.workout_id = w.id and b.block_type = 'exercise' limit 1) as reps_min,
      (select prescribed_reps_max from public.workout_blocks b where b.workout_id = w.id and b.block_type = 'exercise' limit 1) as reps_max,
      (e.trainer_id is null and e.owner_client_id is null and w.trainer_id is null and w.owner_client_id is null and p.trainer_id is null and p.owner_client_id is null) as owners_null,
      (select count(*)::int from public.programs) as program_count
    from public.exercises e
    join public.workouts w on w.name = 'Push A'
    join public.programs p on p.name = 'Push Pull'
    where e.name = 'Bench Press' and e.trainer_id is null
  `);
  const row = rows.rows[0];
  assert.ok(row);
  return {
    exerciseId: row.exercise_id,
    workoutId: row.workout_id,
    programId: row.program_id,
    equipment: row.equipment,
    minutes: row.minutes,
    blockCount: row.block_count,
    repsMin: row.reps_min,
    repsMax: row.reps_max,
    ownersNull: row.owners_null,
    programCount: row.program_count,
  };
}
