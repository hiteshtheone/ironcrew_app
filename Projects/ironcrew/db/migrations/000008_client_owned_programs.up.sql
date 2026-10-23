-- Clients can build and run their own programs, workouts, and exercises.
--
-- Ownership model: a program/workout is owned by exactly one of a trainer
-- (trainer_id) or a client (owner_client_id). Exercises may additionally be
-- shared (both null). Assignments record who created them via
-- assigned_by_trainer_id or assigned_by_client_id.
--
-- A client may have several active programs. Starting an additional one while
-- another is active requires explicit confirmation (p_allow_overlap) and is
-- otherwise rejected with ACTIVE_PROGRAM_EXISTS so the UI can warn first.

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------

alter table public.programs
  add column owner_client_id uuid references public.clients(id) on delete cascade,
  alter column trainer_id drop not null,
  add constraint programs_single_owner check (num_nonnulls(trainer_id, owner_client_id) = 1);

alter table public.workouts
  add column owner_client_id uuid references public.clients(id) on delete cascade,
  alter column trainer_id drop not null,
  add constraint workouts_single_owner check (num_nonnulls(trainer_id, owner_client_id) = 1);

-- Null trainer_id and null owner_client_id together still mean "shared".
alter table public.exercises
  add column owner_client_id uuid references public.clients(id) on delete cascade,
  add constraint exercises_at_most_one_owner check (num_nonnulls(trainer_id, owner_client_id) <= 1);

alter table public.exercises drop constraint if exists exercises_trainer_id_name_key;
alter table public.exercises
  add constraint exercises_owner_name_key unique nulls not distinct (trainer_id, owner_client_id, name);

alter table public.program_assignments
  add column assigned_by_client_id uuid references public.clients(id) on delete cascade,
  alter column assigned_by_trainer_id drop not null,
  add constraint program_assignments_single_assigner
    check (num_nonnulls(assigned_by_trainer_id, assigned_by_client_id) = 1);

alter table public.workout_assignments
  add column assigned_by_client_id uuid references public.clients(id) on delete cascade,
  alter column assigned_by_trainer_id drop not null,
  add constraint workout_assignments_single_assigner
    check (num_nonnulls(assigned_by_trainer_id, assigned_by_client_id) = 1);

create index programs_owner_client_idx on public.programs (owner_client_id) where owner_client_id is not null;
create index workouts_owner_client_idx on public.workouts (owner_client_id) where owner_client_id is not null;
create index exercises_owner_client_idx on public.exercises (owner_client_id) where owner_client_id is not null;

-- Multiple active programs per client are now allowed (see header). The
-- per-program unique index from 000001 still prevents assigning the same
-- program twice.
drop index if exists public.program_assignments_one_active_per_client;

-- ---------------------------------------------------------------------------
-- Ownership helpers
-- ---------------------------------------------------------------------------

create or replace function public.owns_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.programs p
    where p.id = p_program_id
      and (p.trainer_id = auth.uid() or public.is_client(p.owner_client_id))
  )
$$;

create or replace function public.owns_workout(p_workout_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.workouts w
    where w.id = p_workout_id
      and (w.trainer_id = auth.uid() or public.is_client(w.owner_client_id))
  )
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy programs_client_owner_all on public.programs
  for all to authenticated
  using (public.is_client(owner_client_id))
  with check (public.is_client(owner_client_id));

create policy workouts_client_owner_all on public.workouts
  for all to authenticated
  using (public.is_client(owner_client_id))
  with check (public.is_client(owner_client_id));

create policy exercises_client_owner_all on public.exercises
  for all to authenticated
  using (public.is_client(owner_client_id))
  with check (public.is_client(owner_client_id));

-- Shared exercises must not include client-owned rows.
drop policy exercises_shared_select on public.exercises;
create policy exercises_shared_select on public.exercises
  for select to authenticated
  using (trainer_id is null and owner_client_id is null);

-- Self-assignment: a client schedules programs and workouts they own for themselves.
create policy program_assignments_client_insert on public.program_assignments
  for insert to authenticated
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.owns_program(program_id)
  );

create policy program_assignments_client_update on public.program_assignments
  for update to authenticated
  using (public.is_client(client_id) and assigned_by_client_id = client_id)
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.owns_program(program_id)
  );

create policy program_assignments_client_delete on public.program_assignments
  for delete to authenticated
  using (public.is_client(client_id) and assigned_by_client_id = client_id);

create policy workout_assignments_client_insert on public.workout_assignments
  for insert to authenticated
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.owns_workout(workout_id)
  );

create policy workout_assignments_client_owner_update on public.workout_assignments
  for update to authenticated
  using (public.is_client(client_id) and assigned_by_client_id = client_id)
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.owns_workout(workout_id)
  );

create policy workout_assignments_client_delete on public.workout_assignments
  for delete to authenticated
  using (public.is_client(client_id) and assigned_by_client_id = client_id);

-- A trainer who manages a client may remove only trainer-created assignments,
-- never rows the client scheduled for themselves.
drop policy program_assignments_trainer_delete on public.program_assignments;
create policy program_assignments_trainer_delete on public.program_assignments
  for delete to authenticated
  using (public.manages_client(client_id) and assigned_by_trainer_id is not null);

drop policy workout_assignments_trainer_delete on public.workout_assignments;
create policy workout_assignments_trainer_delete on public.workout_assignments
  for delete to authenticated
  using (public.manages_client(client_id) and assigned_by_trainer_id is not null);

-- ---------------------------------------------------------------------------
-- Guard trigger: clients keep full control of rows they created themselves;
-- for trainer-assigned rows only the status column may change (000004).
-- ---------------------------------------------------------------------------

create or replace function public.guard_client_workout_assignment_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_client(old.client_id)
    and not public.manages_client(old.client_id)
    and old.assigned_by_client_id is null
  then
    if old.status = 'cancelled' then
      raise exception 'You cannot update a cancelled workout' using errcode = '42501';
    end if;

    if new.status not in ('scheduled', 'in_progress', 'completed', 'skipped') then
      raise exception 'You cannot cancel a workout' using errcode = '42501';
    end if;

    if new.client_id is distinct from old.client_id
      or new.workout_id is distinct from old.workout_id
      or new.program_assignment_id is distinct from old.program_assignment_id
      or new.program_workout_id is distinct from old.program_workout_id
      or new.assigned_by_trainer_id is distinct from old.assigned_by_trainer_id
      or new.assigned_by_client_id is distinct from old.assigned_by_client_id
      or new.scheduled_for is distinct from old.scheduled_for
      or new.notes is distinct from old.notes
      or new.created_at is distinct from old.created_at
    then
      raise exception 'You can only update workout status' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Copies keep the source's owner, which the caller is known to own.
create or replace function public.duplicate_workout(p_workout_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workout public.workouts%rowtype;
  v_workout_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_workout from public.workouts where id = p_workout_id;
  if not found then
    raise exception 'Workout not found';
  end if;

  if not public.owns_workout(p_workout_id) then
    raise exception 'You do not own this workout' using errcode = '42501';
  end if;

  insert into public.workouts (
    trainer_id,
    owner_client_id,
    name,
    description,
    estimated_duration_minutes,
    is_template
  ) values (
    v_workout.trainer_id,
    v_workout.owner_client_id,
    left('Copy of ' || v_workout.name, 160),
    v_workout.description,
    v_workout.estimated_duration_minutes,
    true
  )
  returning id into v_workout_id;

  insert into public.workout_blocks (
    workout_id,
    exercise_id,
    block_type,
    position,
    title,
    prescribed_sets,
    prescribed_reps_min,
    prescribed_reps_max,
    prescribed_load,
    load_unit,
    rest_seconds,
    tempo,
    rpe_target,
    instructions,
    configuration
  )
  select
    v_workout_id,
    exercise_id,
    block_type,
    position,
    title,
    prescribed_sets,
    prescribed_reps_min,
    prescribed_reps_max,
    prescribed_load,
    load_unit,
    rest_seconds,
    tempo,
    rpe_target,
    instructions,
    configuration
  from public.workout_blocks
  where workout_id = p_workout_id
  order by position;

  return jsonb_build_object('id', v_workout_id);
end;
$$;

create or replace function public.duplicate_program(p_program_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_program public.programs%rowtype;
  v_program_id uuid;
  v_phase public.program_phases%rowtype;
  v_phase_id uuid;
  v_week public.program_weeks%rowtype;
  v_week_id uuid;
  v_slot public.program_workouts%rowtype;
  v_workout_map jsonb := '{}'::jsonb;
  v_copied_workout_id uuid;
  v_copied jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_program from public.programs where id = p_program_id;
  if not found then
    raise exception 'Program not found';
  end if;

  if not public.owns_program(p_program_id) then
    raise exception 'You do not own this program' using errcode = '42501';
  end if;

  insert into public.programs (
    trainer_id,
    owner_client_id,
    name,
    description,
    status,
    estimated_duration_weeks
  ) values (
    v_program.trainer_id,
    v_program.owner_client_id,
    left('Copy of ' || v_program.name, 160),
    v_program.description,
    'draft',
    v_program.estimated_duration_weeks
  )
  returning id into v_program_id;

  for v_phase in
    select * from public.program_phases
    where program_id = p_program_id
    order by position
  loop
    insert into public.program_phases (program_id, name, position, description)
    values (v_program_id, v_phase.name, v_phase.position, v_phase.description)
    returning id into v_phase_id;

    for v_week in
      select * from public.program_weeks
      where program_phase_id = v_phase.id
      order by week_number
    loop
      insert into public.program_weeks (program_phase_id, week_number, name, notes)
      values (v_phase_id, v_week.week_number, v_week.name, v_week.notes)
      returning id into v_week_id;

      for v_slot in
        select * from public.program_workouts
        where program_week_id = v_week.id
        order by day_number, position
      loop
        v_copied_workout_id := nullif(v_workout_map ->> (v_slot.workout_id::text), '')::uuid;
        if v_copied_workout_id is null then
          v_copied := public.duplicate_workout(v_slot.workout_id);
          v_copied_workout_id := (v_copied ->> 'id')::uuid;
          v_workout_map := v_workout_map || jsonb_build_object(v_slot.workout_id::text, v_copied_workout_id);
        end if;

        insert into public.program_workouts (
          program_week_id,
          workout_id,
          day_number,
          position,
          title_override,
          notes
        ) values (
          v_week_id,
          v_copied_workout_id,
          v_slot.day_number,
          v_slot.position,
          v_slot.title_override,
          v_slot.notes
        );
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('id', v_program_id);
end;
$$;

-- save_workout: an exercise is usable when it is shared or owned by the caller
-- (as a trainer or as a client). The rest of the body is unchanged from 000003.
create or replace function public.save_workout(
  p_workout_id uuid,
  p_name text,
  p_description text,
  p_duration_minutes integer,
  p_blocks jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_index integer;
  v_block jsonb;
  v_block_type text;
  v_exercise_id uuid;
  v_title text;
  v_sets integer;
  v_reps_min integer;
  v_reps_max integer;
  v_load numeric;
  v_load_unit text;
  v_rest integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.workouts where id = p_workout_id) then
    raise exception 'Workout not found';
  end if;

  if not public.owns_workout(p_workout_id) then
    raise exception 'You do not own this workout' using errcode = '42501';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Workout name must be between 1 and 160 characters';
  end if;

  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'Duration must be greater than 0';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array';
  end if;

  for v_index in 0 .. jsonb_array_length(p_blocks) - 1 loop
    v_block := p_blocks -> v_index;
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'Each block must be an object';
    end if;

    v_block_type := v_block ->> 'block_type';
    if v_block_type is null or v_block_type not in (
      'warmup', 'exercise', 'superset', 'circuit', 'conditioning', 'cooldown', 'notes'
    ) then
      raise exception 'block_type is not recognized';
    end if;

    v_exercise_id := null;
    if v_block ? 'exercise_id'
      and jsonb_typeof(v_block -> 'exercise_id') <> 'null'
      and nullif(v_block ->> 'exercise_id', '') is not null
    then
      begin
        v_exercise_id := (v_block ->> 'exercise_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'exercise_id must be a UUID';
      end;
    end if;

    if v_block_type = 'exercise' and v_exercise_id is null then
      raise exception 'An exercise must be set for exercise blocks';
    end if;

    if v_exercise_id is not null and not exists (
      select 1
      from public.exercises e
      where e.id = v_exercise_id
        and (
          e.trainer_id = auth.uid()
          or public.is_client(e.owner_client_id)
          or (e.trainer_id is null and e.owner_client_id is null)
        )
    ) then
      raise exception 'Exercise not found';
    end if;

    v_title := nullif(trim(v_block ->> 'title'), '');
    if v_title is not null and char_length(v_title) > 160 then
      raise exception 'Block title must be 160 characters or fewer';
    end if;

    v_sets := public.optional_positive_int(v_block -> 'prescribed_sets', 'prescribed_sets');
    v_reps_min := public.optional_positive_int(v_block -> 'prescribed_reps_min', 'prescribed_reps_min');
    v_reps_max := public.optional_positive_int(v_block -> 'prescribed_reps_max', 'prescribed_reps_max');
    v_rest := public.optional_nonnegative_int(v_block -> 'rest_seconds', 'rest_seconds');
    v_load := public.optional_nonnegative_numeric(v_block -> 'prescribed_load', 'prescribed_load');
    v_load_unit := nullif(trim(v_block ->> 'load_unit'), '');

    if v_reps_max is not null and v_reps_min is not null and v_reps_max < v_reps_min then
      raise exception 'prescribed_reps_max must be greater than or equal to prescribed_reps_min';
    end if;
  end loop;

  update public.workouts
  set
    name = trim(p_name),
    description = nullif(trim(p_description), ''),
    estimated_duration_minutes = p_duration_minutes
  where id = p_workout_id;

  delete from public.workout_blocks where workout_id = p_workout_id;

  for v_index in 0 .. jsonb_array_length(p_blocks) - 1 loop
    v_block := p_blocks -> v_index;
    v_block_type := v_block ->> 'block_type';
    v_exercise_id := null;
    if nullif(v_block ->> 'exercise_id', '') is not null
      and jsonb_typeof(v_block -> 'exercise_id') <> 'null'
    then
      v_exercise_id := (v_block ->> 'exercise_id')::uuid;
    end if;
    v_title := nullif(trim(v_block ->> 'title'), '');
    v_sets := public.optional_positive_int(v_block -> 'prescribed_sets', 'prescribed_sets');
    v_reps_min := public.optional_positive_int(v_block -> 'prescribed_reps_min', 'prescribed_reps_min');
    v_reps_max := public.optional_positive_int(v_block -> 'prescribed_reps_max', 'prescribed_reps_max');
    v_rest := public.optional_nonnegative_int(v_block -> 'rest_seconds', 'rest_seconds');
    v_load := public.optional_nonnegative_numeric(v_block -> 'prescribed_load', 'prescribed_load');
    v_load_unit := nullif(trim(v_block ->> 'load_unit'), '');

    insert into public.workout_blocks (
      workout_id,
      exercise_id,
      block_type,
      position,
      title,
      prescribed_sets,
      prescribed_reps_min,
      prescribed_reps_max,
      prescribed_load,
      load_unit,
      rest_seconds
    ) values (
      p_workout_id,
      v_exercise_id,
      v_block_type::public.workout_block_type,
      v_index + 1,
      v_title,
      v_sets,
      v_reps_min,
      v_reps_max,
      v_load,
      v_load_unit,
      v_rest
    );
  end loop;

  return jsonb_build_object('id', p_workout_id);
end;
$$;

-- start_client_plan: the hard "already has an active program" error becomes a
-- confirmable ACTIVE_PROGRAM_EXISTS error. The signature changes (new trailing
-- parameter), so the previous overload is dropped first.
drop function public.start_client_plan(uuid, text, public.goal_type, numeric, text, date, text, uuid, date);

create or replace function public.start_client_plan(
  p_client_id uuid,
  p_title text,
  p_goal_type public.goal_type,
  p_target_value numeric,
  p_target_unit text,
  p_target_date date,
  p_notes text,
  p_program_id uuid,
  p_starts_on date,
  p_allow_overlap boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_goal_id uuid;
  v_assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_title is null or char_length(trim(p_title)) not between 1 and 160 then
    raise exception 'Goal title must be between 1 and 160 characters';
  end if;

  if p_starts_on is null then
    raise exception 'starts_on is required';
  end if;

  if p_goal_type is null then
    raise exception 'goal_type is required';
  end if;

  if not public.manages_client(p_client_id) then
    raise exception 'You do not manage this client' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.programs where id = p_program_id and trainer_id = auth.uid()
  ) then
    raise exception 'You do not own this program' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.program_assignments
    where client_id = p_client_id
      and program_id = p_program_id
      and status in ('scheduled', 'in_progress')
  ) then
    raise exception 'This program is already active for this client';
  end if;

  if not coalesce(p_allow_overlap, false) and exists (
    select 1
    from public.program_assignments
    where client_id = p_client_id
      and status in ('scheduled', 'in_progress')
  ) then
    raise exception 'ACTIVE_PROGRAM_EXISTS' using errcode = 'P0001';
  end if;

  insert into public.goals (
    client_id,
    created_by_trainer_id,
    title,
    goal_type,
    status,
    target_value,
    target_unit,
    target_date,
    notes
  ) values (
    p_client_id,
    auth.uid(),
    trim(p_title),
    p_goal_type,
    'active',
    p_target_value,
    nullif(trim(p_target_unit), ''),
    p_target_date,
    nullif(trim(p_notes), '')
  )
  returning id into v_goal_id;

  insert into public.program_assignments (
    program_id,
    client_id,
    assigned_by_trainer_id,
    goal_id,
    status,
    starts_on
  ) values (
    p_program_id,
    p_client_id,
    auth.uid(),
    v_goal_id,
    'in_progress',
    p_starts_on
  )
  returning id into v_assignment_id;

  return jsonb_build_object(
    'goal_id', v_goal_id,
    'program_assignment_id', v_assignment_id
  );
end;
$$;

-- start_own_program: a client starts a program they own for themselves. The
-- goal is optional. Overlap with another active program must be confirmed.
create or replace function public.start_own_program(
  p_program_id uuid,
  p_starts_on date,
  p_goal_title text default null,
  p_goal_type public.goal_type default 'other',
  p_allow_overlap boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client_id uuid;
  v_goal_id uuid;
  v_assignment_id uuid;
  v_goal_title text := nullif(trim(p_goal_title), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_starts_on is null then
    raise exception 'starts_on is required';
  end if;

  select owner_client_id into v_client_id
  from public.programs
  where id = p_program_id;

  if v_client_id is null or not public.is_client(v_client_id) then
    raise exception 'You do not own this program' using errcode = '42501';
  end if;

  if v_goal_title is not null and char_length(v_goal_title) > 160 then
    raise exception 'Goal title must be 160 characters or fewer';
  end if;

  if exists (
    select 1
    from public.program_assignments
    where client_id = v_client_id
      and program_id = p_program_id
      and status in ('scheduled', 'in_progress')
  ) then
    raise exception 'This program is already active';
  end if;

  if not coalesce(p_allow_overlap, false) and exists (
    select 1
    from public.program_assignments
    where client_id = v_client_id
      and status in ('scheduled', 'in_progress')
  ) then
    raise exception 'ACTIVE_PROGRAM_EXISTS' using errcode = 'P0001';
  end if;

  if v_goal_title is not null then
    insert into public.goals (client_id, title, goal_type, status)
    values (v_client_id, v_goal_title, coalesce(p_goal_type, 'other'), 'active')
    returning id into v_goal_id;
  end if;

  insert into public.program_assignments (
    program_id,
    client_id,
    assigned_by_client_id,
    goal_id,
    status,
    starts_on
  ) values (
    p_program_id,
    v_client_id,
    v_client_id,
    v_goal_id,
    'in_progress',
    p_starts_on
  )
  returning id into v_assignment_id;

  return jsonb_build_object(
    'goal_id', v_goal_id,
    'program_assignment_id', v_assignment_id
  );
end;
$$;

-- publish_program_week: trainers publish to the clients they manage; a client
-- publishes their own program onto their own calendar.
create or replace function public.publish_program_week(
  p_program_week_id uuid,
  p_week_start date,
  p_client_ids uuid[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_program_id uuid;
  v_owner_client_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_assignment record;
  v_workout record;
  v_date date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_week_start is null then
    raise exception 'week_start is required';
  end if;

  select pp.program_id
  into v_program_id
  from public.program_weeks pw
  join public.program_phases pp on pp.id = pw.program_phase_id
  where pw.id = p_program_week_id;

  if v_program_id is null then
    raise exception 'Program week not found';
  end if;

  if not public.owns_program(v_program_id) then
    raise exception 'You do not own this program' using errcode = '42501';
  end if;

  select owner_client_id into v_owner_client_id
  from public.programs
  where id = v_program_id;

  for v_assignment in
    select pa.id, pa.client_id
    from public.program_assignments pa
    where pa.program_id = v_program_id
      and pa.status in ('scheduled', 'in_progress')
      and (p_client_ids is null or pa.client_id = any (p_client_ids))
  loop
    if v_owner_client_id is not null then
      if v_assignment.client_id <> v_owner_client_id
        or not public.is_client(v_assignment.client_id)
      then
        continue;
      end if;
    elsif not public.manages_client(v_assignment.client_id) then
      continue;
    end if;

    for v_workout in
      select id, workout_id, day_number
      from public.program_workouts
      where program_week_id = p_program_week_id
      order by day_number, position
    loop
      v_date := p_week_start + (v_workout.day_number - 1);

      -- Same template slot and date is already on the calendar, including a
      -- completed session. Leave that row alone.
      if exists (
        select 1
        from public.workout_assignments wa
        where wa.client_id = v_assignment.client_id
          and wa.program_workout_id = v_workout.id
          and wa.scheduled_for = v_date
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      insert into public.workout_assignments (
        client_id,
        workout_id,
        program_assignment_id,
        program_workout_id,
        assigned_by_trainer_id,
        assigned_by_client_id,
        scheduled_for,
        status
      ) values (
        v_assignment.client_id,
        v_workout.workout_id,
        v_assignment.id,
        v_workout.id,
        case when v_owner_client_id is null then auth.uid() end,
        v_owner_client_id,
        v_date,
        'scheduled'
      );

      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

revoke all on function public.start_client_plan(uuid, text, public.goal_type, numeric, text, date, text, uuid, date, boolean) from public;
grant execute on function public.start_client_plan(uuid, text, public.goal_type, numeric, text, date, text, uuid, date, boolean) to authenticated;

revoke all on function public.start_own_program(uuid, date, text, public.goal_type, boolean) from public;
grant execute on function public.start_own_program(uuid, date, text, public.goal_type, boolean) to authenticated;
