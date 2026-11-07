-- Undo the trainer self-training schema. Private client rows created by
-- ensure_trainer_self_client() are left in place.

drop function public.duplicate_program(uuid, boolean);
drop function public.duplicate_workout(uuid, boolean);

create function public.duplicate_workout(p_workout_id uuid)
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
    configuration,
    prescribed_duration_seconds,
    prescribed_distance_meters,
    prescribed_height_cm
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
    configuration,
    prescribed_duration_seconds,
    prescribed_distance_meters,
    prescribed_height_cm
  from public.workout_blocks
  where workout_id = p_workout_id
  order by position;

  return jsonb_build_object('id', v_workout_id);
end;
$$;

create function public.duplicate_program(p_program_id uuid)
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

revoke all on function public.duplicate_workout(uuid) from public;
grant execute on function public.duplicate_workout(uuid) to authenticated;

revoke all on function public.duplicate_program(uuid) from public;
grant execute on function public.duplicate_program(uuid) to authenticated;

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

drop function public.ensure_trainer_self_client();
