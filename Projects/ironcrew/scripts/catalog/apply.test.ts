import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { applyDocument, type SqlClient } from "./apply";
import { CatalogError, parseCatalog, type CatalogDocument } from "./document";

const schema = `
create type public.program_status as enum ('draft', 'active', 'archived');
create type public.workout_block_type as enum ('warmup', 'exercise', 'superset', 'circuit', 'conditioning', 'cooldown', 'notes');

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
  unique (program_phase_id, week_number)
);

create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_week_id uuid not null references public.program_weeks(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete restrict,
  day_number integer not null check (day_number between 1 and 7),
  position integer not null default 1 check (position > 0),
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
