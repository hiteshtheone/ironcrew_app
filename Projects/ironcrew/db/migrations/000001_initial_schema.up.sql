-- Trainer App: initial Supabase/PostgreSQL schema
-- Assumptions: the caller has privileges to create types, functions, triggers,
-- and RLS policies in the public schema. Authenticated identities live in auth.users.

create extension if not exists pgcrypto;

-- Enumerations keep lifecycle fields consistent without preventing future extensions.
create type public.profile_role as enum ('trainer', 'client');
create type public.client_status as enum ('active', 'inactive', 'archived');
create type public.goal_type as enum ('strength', 'hypertrophy', 'fat_loss', 'endurance', 'mobility', 'rehabilitation', 'other');
create type public.goal_status as enum ('active', 'achieved', 'paused', 'cancelled');
create type public.program_status as enum ('draft', 'active', 'archived');
create type public.assignment_status as enum ('scheduled', 'in_progress', 'completed', 'skipped', 'cancelled');
create type public.workout_block_type as enum ('warmup', 'exercise', 'superset', 'circuit', 'conditioning', 'cooldown', 'notes');
create type public.session_status as enum ('in_progress', 'completed', 'abandoned');
create type public.measurement_type as enum ('weight', 'body_fat_percent', 'chest', 'waist', 'hips', 'arm', 'thigh', 'calf', 'custom');
create type public.note_visibility as enum ('trainer_only', 'shared_with_client');

-- All application identities map one-to-one to Supabase Auth users.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.profile_role not null,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  avatar_url text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trainers (
  id uuid primary key references public.profiles(id) on delete cascade,
  business_name text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  -- Null permits a trainer to prepare an invitation before the client signs up.
  profile_id uuid unique references public.profiles(id) on delete set null,
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text,
  email text,
  phone text,
  date_of_birth date check (date_of_birth <= current_date),
  status public.client_status not null default 'active',
  onboarding_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_email_lower_unique on public.clients (lower(email)) where email is not null;

-- A client may be connected to several trainers, but only one active primary trainer.
create table public.trainer_clients (
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  is_primary boolean not null default true,
  status public.client_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trainer_id, client_id),
  check (ended_at is null or ended_at >= started_at)
);
create unique index trainer_clients_one_primary_active
  on public.trainer_clients (client_id) where is_primary and status = 'active';

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by_trainer_id uuid references public.trainers(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  goal_type public.goal_type not null default 'other',
  status public.goal_status not null default 'active',
  target_value numeric(12,3),
  target_unit text,
  target_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  status public.program_status not null default 'draft',
  estimated_duration_weeks integer check (estimated_duration_weeks > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_by_trainer_id uuid not null references public.trainers(id) on delete restrict,
  status public.assignment_status not null default 'scheduled',
  starts_on date not null,
  ends_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create unique index program_assignments_one_active_per_program_client
  on public.program_assignments (program_id, client_id)
  where status in ('scheduled', 'in_progress');

create table public.program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  position integer not null check (position > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, position)
);

create table public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_phase_id uuid not null references public.program_phases(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_phase_id, week_number)
);

-- Workouts and exercises are trainer-owned reusable library objects.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  estimated_duration_minutes integer check (estimated_duration_minutes > 0),
  is_template boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  -- Null marks a shared/system exercise; otherwise it is private to this trainer.
  trainer_id uuid references public.trainers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  instructions text,
  primary_muscle_group text,
  equipment text,
  video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (trainer_id, name)
);

-- A block can be a section or a prescribed exercise. Exercise-level prescriptions
-- live here to retain the agreed 18-table model (no separate workout_exercises table).
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
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, position),
  check (block_type <> 'exercise' or exercise_id is not null)
);

create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_week_id uuid not null references public.program_weeks(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete restrict,
  day_number integer not null check (day_number between 1 and 7),
  position integer not null default 1 check (position > 0),
  title_override text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_week_id, day_number, position)
);

create table public.workout_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete restrict,
  program_assignment_id uuid references public.program_assignments(id) on delete set null,
  program_workout_id uuid references public.program_workouts(id) on delete set null,
  assigned_by_trainer_id uuid not null references public.trainers(id) on delete restrict,
  scheduled_for date not null,
  status public.assignment_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  workout_assignment_id uuid unique references public.workout_assignments(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete restrict,
  status public.session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  client_feedback text,
  trainer_feedback text,
  workout_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(workout_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at),
  check (status <> 'completed' or completed_at is not null)
);

create table public.exercise_results (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  workout_block_id uuid references public.workout_blocks(id) on delete set null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  set_number integer not null check (set_number > 0),
  repetitions integer check (repetitions >= 0),
  load numeric(10,3) check (load >= 0),
  load_unit text,
  duration_seconds integer check (duration_seconds >= 0),
  distance_meters numeric(12,2) check (distance_meters >= 0),
  rpe numeric(3,1) check (rpe between 0 and 10),
  is_completed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_id, exercise_id, set_number)
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  recorded_by uuid references public.profiles(id) on delete set null,
  measurement_type public.measurement_type not null,
  value numeric(12,3) not null,
  unit text not null check (char_length(trim(unit)) between 1 and 20),
  recorded_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  visibility public.note_visibility not null default 'trainer_only',
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Query-path indexes (primary/unique keys already index their key columns).
create index trainer_clients_client_active_idx on public.trainer_clients (client_id) where status = 'active';
create index goals_client_status_idx on public.goals (client_id, status);
create index programs_trainer_status_idx on public.programs (trainer_id, status);
create index program_assignments_client_status_idx on public.program_assignments (client_id, status);
create index program_phases_program_idx on public.program_phases (program_id, position);
create index program_weeks_phase_idx on public.program_weeks (program_phase_id, week_number);
create index workouts_trainer_idx on public.workouts (trainer_id);
create index exercises_trainer_idx on public.exercises (trainer_id);
create index workout_blocks_workout_idx on public.workout_blocks (workout_id, position);
create index program_workouts_workout_idx on public.program_workouts (workout_id);
create index workout_assignments_client_date_idx on public.workout_assignments (client_id, scheduled_for desc);
create index workout_sessions_client_started_idx on public.workout_sessions (client_id, started_at desc);
create index exercise_results_session_idx on public.exercise_results (workout_session_id);
create index measurements_client_date_idx on public.measurements (client_id, recorded_on desc);
create index client_notes_client_created_idx on public.client_notes (client_id, created_at desc);

-- Shared timestamp trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger trainers_set_updated_at before update on public.trainers for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger trainer_clients_set_updated_at before update on public.trainer_clients for each row execute function public.set_updated_at();
create trigger goals_set_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger programs_set_updated_at before update on public.programs for each row execute function public.set_updated_at();
create trigger program_assignments_set_updated_at before update on public.program_assignments for each row execute function public.set_updated_at();
create trigger program_phases_set_updated_at before update on public.program_phases for each row execute function public.set_updated_at();
create trigger program_weeks_set_updated_at before update on public.program_weeks for each row execute function public.set_updated_at();
create trigger workouts_set_updated_at before update on public.workouts for each row execute function public.set_updated_at();
create trigger exercises_set_updated_at before update on public.exercises for each row execute function public.set_updated_at();
create trigger workout_blocks_set_updated_at before update on public.workout_blocks for each row execute function public.set_updated_at();
create trigger program_workouts_set_updated_at before update on public.program_workouts for each row execute function public.set_updated_at();
create trigger workout_assignments_set_updated_at before update on public.workout_assignments for each row execute function public.set_updated_at();
create trigger workout_sessions_set_updated_at before update on public.workout_sessions for each row execute function public.set_updated_at();
create trigger exercise_results_set_updated_at before update on public.exercise_results for each row execute function public.set_updated_at();
create trigger measurements_set_updated_at before update on public.measurements for each row execute function public.set_updated_at();
create trigger client_notes_set_updated_at before update on public.client_notes for each row execute function public.set_updated_at();

-- SECURITY DEFINER helpers avoid RLS recursion while keeping policies readable.
create or replace function public.is_trainer()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.trainers where id = auth.uid()) $$;

create or replace function public.is_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.clients where id = p_client_id and profile_id = auth.uid()) $$;

create or replace function public.is_trainer_for_client(p_trainer_id uuid, p_client_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.trainer_clients where trainer_id = p_trainer_id and client_id = p_client_id and status = 'active') $$;

create or replace function public.manages_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_trainer_for_client(auth.uid(), p_client_id) $$;

create or replace function public.owns_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.programs where id = p_program_id and trainer_id = auth.uid()) $$;

create or replace function public.owns_workout(p_workout_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.workouts where id = p_workout_id and trainer_id = auth.uid()) $$;

alter table public.profiles enable row level security;
alter table public.trainers enable row level security;
alter table public.clients enable row level security;
alter table public.trainer_clients enable row level security;
alter table public.goals enable row level security;
alter table public.programs enable row level security;
alter table public.program_assignments enable row level security;
alter table public.program_phases enable row level security;
alter table public.program_weeks enable row level security;
alter table public.program_workouts enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_blocks enable row level security;
alter table public.workout_assignments enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.exercise_results enable row level security;
alter table public.measurements enable row level security;
alter table public.client_notes enable row level security;

-- Profiles and relationship administration.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.clients c where c.profile_id = profiles.id and public.manages_client(c.id))
  or exists (select 1 from public.trainer_clients tc where tc.trainer_id = profiles.id and public.is_client(tc.client_id))
);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy trainers_select on public.trainers for select to authenticated using (id = auth.uid() or exists (select 1 from public.trainer_clients tc where tc.trainer_id = trainers.id and public.is_client(tc.client_id)));
-- This policy intentionally does not call is_trainer(): it is the bootstrap path
-- by which a newly signed-up user becomes a trainer.
create policy trainers_insert_self on public.trainers for insert to authenticated with check (id = auth.uid());
create policy trainers_update_self on public.trainers for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy clients_trainer_all on public.clients for all to authenticated using (public.manages_client(id)) with check (public.manages_client(id));
-- A trainer creates the client before creating its trainer_clients relationship.
create policy clients_trainer_create on public.clients for insert to authenticated with check (public.is_trainer());
create policy clients_self_select_update on public.clients for select to authenticated using (public.is_client(id));
create policy clients_self_update on public.clients for update to authenticated using (public.is_client(id)) with check (public.is_client(id));
create policy trainer_clients_trainer_all on public.trainer_clients for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy trainer_clients_client_select on public.trainer_clients for select to authenticated using (public.is_client(client_id));

-- Client-owned records: assigned trainer has full control; client can read and add
-- their own goals, measurements, workout completion data, and shared notes.
create policy goals_access on public.goals for all to authenticated using (public.manages_client(client_id) or public.is_client(client_id)) with check (public.manages_client(client_id) or public.is_client(client_id));
create policy program_assignments_access on public.program_assignments for select to authenticated using (public.manages_client(client_id) or public.is_client(client_id));
create policy program_assignments_trainer_write on public.program_assignments for insert to authenticated with check (public.manages_client(client_id) and assigned_by_trainer_id = auth.uid() and public.owns_program(program_id));
create policy program_assignments_trainer_update on public.program_assignments for update to authenticated using (public.manages_client(client_id) and public.owns_program(program_id)) with check (public.manages_client(client_id) and public.owns_program(program_id));
create policy program_assignments_trainer_delete on public.program_assignments for delete to authenticated using (public.manages_client(client_id));
create policy workout_assignments_access on public.workout_assignments for select to authenticated using (public.manages_client(client_id) or public.is_client(client_id));
create policy workout_assignments_trainer_write on public.workout_assignments for insert to authenticated with check (public.manages_client(client_id) and assigned_by_trainer_id = auth.uid() and public.owns_workout(workout_id));
create policy workout_assignments_trainer_update on public.workout_assignments for update to authenticated using (public.manages_client(client_id) and public.owns_workout(workout_id)) with check (public.manages_client(client_id) and public.owns_workout(workout_id));
create policy workout_assignments_trainer_delete on public.workout_assignments for delete to authenticated using (public.manages_client(client_id));
create policy workout_sessions_access on public.workout_sessions for select to authenticated using (public.manages_client(client_id) or public.is_client(client_id));
create policy workout_sessions_client_insert on public.workout_sessions for insert to authenticated with check (public.is_client(client_id));
create policy workout_sessions_access_update on public.workout_sessions for update to authenticated using (public.manages_client(client_id) or public.is_client(client_id)) with check (public.manages_client(client_id) or public.is_client(client_id));
create policy exercise_results_access on public.exercise_results for select to authenticated using (exists (select 1 from public.workout_sessions s where s.id = exercise_results.workout_session_id and (public.manages_client(s.client_id) or public.is_client(s.client_id))));
create policy exercise_results_write on public.exercise_results for all to authenticated using (exists (select 1 from public.workout_sessions s where s.id = exercise_results.workout_session_id and (public.manages_client(s.client_id) or public.is_client(s.client_id)))) with check (exists (select 1 from public.workout_sessions s where s.id = exercise_results.workout_session_id and (public.manages_client(s.client_id) or public.is_client(s.client_id))));
create policy measurements_access on public.measurements for all to authenticated using (public.manages_client(client_id) or public.is_client(client_id)) with check ((public.manages_client(client_id) or public.is_client(client_id)) and recorded_by = auth.uid());
create policy client_notes_select on public.client_notes for select to authenticated using (public.manages_client(client_id) or (public.is_client(client_id) and visibility = 'shared_with_client'));
create policy client_notes_trainer_write on public.client_notes for all to authenticated using (public.manages_client(client_id)) with check (public.manages_client(client_id) and author_id = auth.uid());
create policy client_notes_client_insert on public.client_notes for insert to authenticated with check (public.is_client(client_id) and author_id = auth.uid() and visibility = 'shared_with_client');

-- Trainer library and its program hierarchy. Clients get read-only access only when
-- it is reachable from one of their program or workout assignments.
create policy programs_trainer_all on public.programs for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy programs_client_select on public.programs for select to authenticated using (exists (select 1 from public.program_assignments pa where pa.program_id = programs.id and public.is_client(pa.client_id)));
create policy program_phases_trainer_all on public.program_phases for all to authenticated using (public.owns_program(program_id)) with check (public.owns_program(program_id));
create policy program_phases_client_select on public.program_phases for select to authenticated using (exists (select 1 from public.program_assignments pa where pa.program_id = program_phases.program_id and public.is_client(pa.client_id)));
create policy program_weeks_trainer_all on public.program_weeks for all to authenticated using (exists (select 1 from public.program_phases pp where pp.id = program_weeks.program_phase_id and public.owns_program(pp.program_id))) with check (exists (select 1 from public.program_phases pp where pp.id = program_weeks.program_phase_id and public.owns_program(pp.program_id)));
create policy program_weeks_client_select on public.program_weeks for select to authenticated using (exists (select 1 from public.program_phases pp join public.program_assignments pa on pa.program_id = pp.program_id where pp.id = program_weeks.program_phase_id and public.is_client(pa.client_id)));
create policy program_workouts_trainer_all on public.program_workouts for all to authenticated using (exists (select 1 from public.program_weeks pw join public.program_phases pp on pp.id = pw.program_phase_id where pw.id = program_workouts.program_week_id and public.owns_program(pp.program_id))) with check (exists (select 1 from public.program_weeks pw join public.program_phases pp on pp.id = pw.program_phase_id where pw.id = program_workouts.program_week_id and public.owns_program(pp.program_id)) and public.owns_workout(workout_id));
create policy program_workouts_client_select on public.program_workouts for select to authenticated using (exists (select 1 from public.program_weeks pw join public.program_phases pp on pp.id = pw.program_phase_id join public.program_assignments pa on pa.program_id = pp.program_id where pw.id = program_workouts.program_week_id and public.is_client(pa.client_id)));
create policy workouts_trainer_all on public.workouts for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy workouts_client_select on public.workouts for select to authenticated using (exists (select 1 from public.workout_assignments wa where wa.workout_id = workouts.id and public.is_client(wa.client_id)));
create policy exercises_trainer_all on public.exercises for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy exercises_shared_select on public.exercises for select to authenticated using (trainer_id is null);
create policy exercises_client_assigned_select on public.exercises for select to authenticated using (exists (select 1 from public.workout_blocks wb join public.workout_assignments wa on wa.workout_id = wb.workout_id where wb.exercise_id = exercises.id and public.is_client(wa.client_id)));
create policy workout_blocks_trainer_all on public.workout_blocks for all to authenticated using (public.owns_workout(workout_id)) with check (public.owns_workout(workout_id));
create policy workout_blocks_client_select on public.workout_blocks for select to authenticated using (exists (select 1 from public.workout_assignments wa where wa.workout_id = workout_blocks.workout_id and public.is_client(wa.client_id)));
