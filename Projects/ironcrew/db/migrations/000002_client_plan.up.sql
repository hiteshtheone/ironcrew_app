-- Link a client's starting goal to their program assignment, keep one active
-- program per client, and publish a shared program week onto client calendars.

alter table public.program_assignments
  add column goal_id uuid references public.goals(id) on delete set null;

create index program_assignments_goal_idx on public.program_assignments (goal_id);

create unique index program_assignments_one_active_per_client
  on public.program_assignments (client_id)
  where status in ('scheduled', 'in_progress');

create or replace function public.start_client_plan(
  p_client_id uuid,
  p_title text,
  p_goal_type public.goal_type,
  p_target_value numeric,
  p_target_unit text,
  p_target_date date,
  p_notes text,
  p_program_id uuid,
  p_starts_on date
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

  if not public.owns_program(p_program_id) then
    raise exception 'You do not own this program' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.program_assignments
    where client_id = p_client_id
      and status in ('scheduled', 'in_progress')
  ) then
    raise exception 'This client already has an active program';
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

  for v_assignment in
    select pa.id, pa.client_id
    from public.program_assignments pa
    where pa.program_id = v_program_id
      and pa.status in ('scheduled', 'in_progress')
      and (p_client_ids is null or pa.client_id = any (p_client_ids))
  loop
    if not public.manages_client(v_assignment.client_id) then
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
        scheduled_for,
        status
      ) values (
        v_assignment.client_id,
        v_workout.workout_id,
        v_assignment.id,
        v_workout.id,
        auth.uid(),
        v_date,
        'scheduled'
      );

      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

revoke all on function public.start_client_plan(uuid, text, public.goal_type, numeric, text, date, text, uuid, date) from public;
grant execute on function public.start_client_plan(uuid, text, public.goal_type, numeric, text, date, text, uuid, date) to authenticated;

revoke all on function public.publish_program_week(uuid, date, uuid[]) from public;
grant execute on function public.publish_program_week(uuid, date, uuid[]) to authenticated;
