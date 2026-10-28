-- System catalog: a program, workout, or exercise with neither owner is
-- available to every signed-in user. Authenticated users can read and use
-- those rows. They cannot insert, update, or delete them. Seeds and the
-- service role write them, because they bypass row-level security.
--
-- Using a system item (assign, start, or place it in a program you own) is
-- separate from owning it. owns_* remains the rule for edits. can_use_* is
-- owns_* or system.

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

alter table public.programs drop constraint programs_single_owner;
alter table public.programs
  add constraint programs_single_owner check (num_nonnulls(trainer_id, owner_client_id) <= 1);

alter table public.workouts drop constraint workouts_single_owner;
alter table public.workouts
  add constraint workouts_single_owner check (num_nonnulls(trainer_id, owner_client_id) <= 1);

comment on constraint programs_single_owner on public.programs is
  'One owner, or none. None means a system program available to every signed-in user.';
comment on constraint workouts_single_owner on public.workouts is
  'One owner, or none. None means a system workout available to every signed-in user.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_system_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.programs
    where id = p_program_id
      and trainer_id is null
      and owner_client_id is null
  )
$$;

create or replace function public.is_system_workout(p_workout_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.workouts
    where id = p_workout_id
      and trainer_id is null
      and owner_client_id is null
  )
$$;

create or replace function public.can_use_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.owns_program(p_program_id) or public.is_system_program(p_program_id)
$$;

create or replace function public.can_use_workout(p_workout_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.owns_workout(p_workout_id) or public.is_system_workout(p_workout_id)
$$;

-- Owner columns for a copy of a system row. Trainers own by trainer_id;
-- clients by owner_client_id. Returns no row when the caller has no library.
create or replace function public.caller_library_owner()
returns table (trainer_id uuid, owner_client_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.profile_role;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role = 'trainer' then
    trainer_id := auth.uid();
    owner_client_id := null;
    return next;
  elsif v_role = 'client' then
    select c.id into owner_client_id
    from public.clients c
    where c.profile_id = auth.uid();
    if owner_client_id is not null then
      trainer_id := null;
      return next;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read policies. Writes stay on the owner policies, which reject both-null.
-- ---------------------------------------------------------------------------

create policy programs_system_select on public.programs
  for select to authenticated
  using (trainer_id is null and owner_client_id is null);

create policy workouts_system_select on public.workouts
  for select to authenticated
  using (trainer_id is null and owner_client_id is null);

create policy program_phases_system_select on public.program_phases
  for select to authenticated
  using (public.is_system_program(program_id));

create policy program_weeks_system_select on public.program_weeks
  for select to authenticated
  using (
    exists (
      select 1
      from public.program_phases pp
      where pp.id = program_weeks.program_phase_id
        and public.is_system_program(pp.program_id)
    )
  );

create policy program_workouts_system_select on public.program_workouts
  for select to authenticated
  using (
    exists (
      select 1
      from public.program_weeks pw
      join public.program_phases pp on pp.id = pw.program_phase_id
      where pw.id = program_workouts.program_week_id
        and public.is_system_program(pp.program_id)
    )
  );

create policy workout_blocks_system_select on public.workout_blocks
  for select to authenticated
  using (public.is_system_workout(workout_id));

-- Place a system workout on a program the caller owns. The parent program
-- must still be owned, so a system program's structure cannot change.
drop policy program_workouts_trainer_all on public.program_workouts;
create policy program_workouts_trainer_all on public.program_workouts
  for all to authenticated
  using (
    exists (
      select 1
      from public.program_weeks pw
      join public.program_phases pp on pp.id = pw.program_phase_id
      where pw.id = program_workouts.program_week_id
        and public.owns_program(pp.program_id)
    )
  )
  with check (
    exists (
      select 1
      from public.program_weeks pw
      join public.program_phases pp on pp.id = pw.program_phase_id
      where pw.id = program_workouts.program_week_id
        and public.owns_program(pp.program_id)
    )
    and public.can_use_workout(workout_id)
  );

drop policy program_assignments_trainer_write on public.program_assignments;
create policy program_assignments_trainer_write on public.program_assignments
  for insert to authenticated
  with check (
    public.manages_client(client_id)
    and assigned_by_trainer_id = auth.uid()
    and public.can_use_program(program_id)
  );

drop policy program_assignments_trainer_update on public.program_assignments;
create policy program_assignments_trainer_update on public.program_assignments
  for update to authenticated
  using (public.manages_client(client_id) and public.can_use_program(program_id))
  with check (public.manages_client(client_id) and public.can_use_program(program_id));

drop policy program_assignments_client_insert on public.program_assignments;
create policy program_assignments_client_insert on public.program_assignments
  for insert to authenticated
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.can_use_program(program_id)
  );

drop policy program_assignments_client_update on public.program_assignments;
create policy program_assignments_client_update on public.program_assignments
  for update to authenticated
  using (public.is_client(client_id) and assigned_by_client_id = client_id)
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.can_use_program(program_id)
  );

drop policy workout_assignments_trainer_write on public.workout_assignments;
create policy workout_assignments_trainer_write on public.workout_assignments
  for insert to authenticated
  with check (
    public.manages_client(client_id)
    and assigned_by_trainer_id = auth.uid()
    and public.can_use_workout(workout_id)
  );

drop policy workout_assignments_trainer_update on public.workout_assignments;
create policy workout_assignments_trainer_update on public.workout_assignments
  for update to authenticated
  using (public.manages_client(client_id) and public.can_use_workout(workout_id))
  with check (public.manages_client(client_id) and public.can_use_workout(workout_id));

drop policy workout_assignments_client_insert on public.workout_assignments;
create policy workout_assignments_client_insert on public.workout_assignments
  for insert to authenticated
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.can_use_workout(workout_id)
  );

drop policy workout_assignments_client_owner_update on public.workout_assignments;
create policy workout_assignments_client_owner_update on public.workout_assignments
  for update to authenticated
  using (public.is_client(client_id) and assigned_by_client_id = client_id)
  with check (
    public.is_client(client_id)
    and assigned_by_client_id = client_id
    and assigned_by_trainer_id is null
    and public.can_use_workout(workout_id)
  );

-- ---------------------------------------------------------------------------
-- Catalog integrity. These run for the service role as well as users.
-- ---------------------------------------------------------------------------

create or replace function public.guard_system_program_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_system boolean;
begin
  select p.trainer_id is null and p.owner_client_id is null
  into v_system
  from public.program_weeks pw
  join public.program_phases pp on pp.id = pw.program_phase_id
  join public.programs p on p.id = pp.program_id
  where pw.id = new.program_week_id;

  if coalesce(v_system, false) and not exists (
    select 1
    from public.workouts w
    where w.id = new.workout_id
      and w.trainer_id is null
      and w.owner_client_id is null
  ) then
    raise exception 'A system program can only include system workouts';
  end if;

  return new;
end;
$$;

create trigger program_workouts_guard_system
  before insert or update of program_week_id, workout_id
  on public.program_workouts
  for each row
  execute function public.guard_system_program_slot();

create or replace function public.guard_system_workout_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_system boolean;
begin
  select w.trainer_id is null and w.owner_client_id is null
  into v_system
  from public.workouts w
  where w.id = new.workout_id;

  if coalesce(v_system, false)
    and new.exercise_id is not null
    and not exists (
      select 1
      from public.exercises e
      where e.id = new.exercise_id
        and e.trainer_id is null
        and e.owner_client_id is null
    )
  then
    raise exception 'A system workout can only include system exercises';
  end if;

  return new;
end;
$$;

create trigger workout_blocks_guard_system
  before insert or update of workout_id, exercise_id
  on public.workout_blocks
  for each row
  execute function public.guard_system_workout_block();

create or replace function public.guard_program_becoming_system()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trainer_id is null
    and new.owner_client_id is null
    and (old.trainer_id is not null or old.owner_client_id is not null)
    and exists (
      select 1
      from public.program_phases pp
      join public.program_weeks pw on pw.program_phase_id = pp.id
      join public.program_workouts slot on slot.program_week_id = pw.id
      join public.workouts w on w.id = slot.workout_id
      where pp.program_id = new.id
        and (w.trainer_id is not null or w.owner_client_id is not null)
    )
  then
    raise exception 'A system program can only include system workouts';
  end if;

  return new;
end;
$$;

create trigger programs_guard_becoming_system
  before update of trainer_id, owner_client_id
  on public.programs
  for each row
  execute function public.guard_program_becoming_system();

create or replace function public.guard_workout_system_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trainer_id is null
    and new.owner_client_id is null
    and (old.trainer_id is not null or old.owner_client_id is not null)
    and exists (
      select 1
      from public.workout_blocks b
      join public.exercises e on e.id = b.exercise_id
      where b.workout_id = new.id
        and (e.trainer_id is not null or e.owner_client_id is not null)
    )
  then
    raise exception 'A system workout can only include system exercises';
  end if;

  if (new.trainer_id is not null or new.owner_client_id is not null)
    and old.trainer_id is null
    and old.owner_client_id is null
    and exists (
      select 1
      from public.program_workouts slot
      join public.program_weeks pw on pw.id = slot.program_week_id
      join public.program_phases pp on pp.id = pw.program_phase_id
      join public.programs p on p.id = pp.program_id
      where slot.workout_id = new.id
        and p.trainer_id is null
        and p.owner_client_id is null
    )
  then
    raise exception 'A system program can only include system workouts';
  end if;

  return new;
end;
$$;

create trigger workouts_guard_system_links
  before update of trainer_id, owner_client_id
  on public.workouts
  for each row
  execute function public.guard_workout_system_links();

create or replace function public.guard_exercise_leaving_system()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.trainer_id is not null or new.owner_client_id is not null)
    and old.trainer_id is null
    and old.owner_client_id is null
    and exists (
      select 1
      from public.workout_blocks b
      join public.workouts w on w.id = b.workout_id
      where b.exercise_id = new.id
        and w.trainer_id is null
        and w.owner_client_id is null
    )
  then
    raise exception 'A system workout can only include system exercises';
  end if;

  return new;
end;
$$;

create trigger exercises_guard_leaving_system
  before update of trainer_id, owner_client_id
  on public.exercises
  for each row
  execute function public.guard_exercise_leaving_system();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- A system source is copied into the caller's library. An owned source keeps
-- its owner, which the caller is known to own.
create or replace function public.duplicate_workout(p_workout_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workout public.workouts%rowtype;
  v_workout_id uuid;
  v_trainer_id uuid;
  v_owner_client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_workout from public.workouts where id = p_workout_id;
  if not found then
    raise exception 'Workout not found';
  end if;

  if public.owns_workout(p_workout_id) then
    v_trainer_id := v_workout.trainer_id;
    v_owner_client_id := v_workout.owner_client_id;
  elsif public.is_system_workout(p_workout_id) then
    select o.trainer_id, o.owner_client_id
    into v_trainer_id, v_owner_client_id
    from public.caller_library_owner() o;
    if v_trainer_id is null and v_owner_client_id is null then
      raise exception 'You do not own this workout' using errcode = '42501';
    end if;
  else
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
    v_trainer_id,
    v_owner_client_id,
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
  v_trainer_id uuid;
  v_owner_client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_program from public.programs where id = p_program_id;
  if not found then
    raise exception 'Program not found';
  end if;

  if public.owns_program(p_program_id) then
    v_trainer_id := v_program.trainer_id;
    v_owner_client_id := v_program.owner_client_id;
  elsif public.is_system_program(p_program_id) then
    select o.trainer_id, o.owner_client_id
    into v_trainer_id, v_owner_client_id
    from public.caller_library_owner() o;
    if v_trainer_id is null and v_owner_client_id is null then
      raise exception 'You do not own this program' using errcode = '42501';
    end if;
  else
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
    v_trainer_id,
    v_owner_client_id,
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

  if not public.can_use_program(p_program_id) then
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

-- A client starts a program they own, or a system program, for themselves.
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

  if public.is_system_program(p_program_id) then
    select c.id into v_client_id
    from public.clients c
    where c.profile_id = auth.uid();
  else
    select owner_client_id into v_client_id
    from public.programs
    where id = p_program_id;
  end if;

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

-- Trainers publish to the clients they manage. A client publishes a program
-- they own, or a system program they started, onto their own calendar.
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
  v_assign_trainer uuid;
  v_assign_client uuid;
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

  if not public.owns_program(v_program_id) and not public.is_system_program(v_program_id) then
    raise exception 'You do not own this program' using errcode = '42501';
  end if;

  select owner_client_id into v_owner_client_id
  from public.programs
  where id = v_program_id;

  for v_assignment in
    select pa.id, pa.client_id, pa.assigned_by_client_id
    from public.program_assignments pa
    where pa.program_id = v_program_id
      and pa.status in ('scheduled', 'in_progress')
      and (p_client_ids is null or pa.client_id = any (p_client_ids))
  loop
    v_assign_trainer := null;
    v_assign_client := null;

    if v_owner_client_id is not null then
      if v_assignment.client_id <> v_owner_client_id
        or not public.is_client(v_assignment.client_id)
      then
        continue;
      end if;
      v_assign_client := v_owner_client_id;
    elsif v_assignment.assigned_by_client_id is not null then
      if not public.is_client(v_assignment.client_id) then
        continue;
      end if;
      v_assign_client := v_assignment.client_id;
    elsif public.manages_client(v_assignment.client_id) then
      v_assign_trainer := auth.uid();
    else
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
        v_assign_trainer,
        v_assign_client,
        v_date,
        'scheduled'
      );

      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;
