-- Optional first-week publish when a client starts a program. The extra
-- argument defaults to false, so existing callers still only create the
-- assignment. Onboarding passes true so week 1 lands on starts_on in the
-- same transaction. Drop the previous signature first: PostgREST cannot
-- choose between two overloads when the new argument is omitted.

drop function if exists public.start_own_program(uuid, date, text, public.goal_type, boolean);

create function public.start_own_program(
  p_program_id uuid,
  p_starts_on date,
  p_goal_title text default null,
  p_goal_type public.goal_type default 'other',
  p_allow_overlap boolean default false,
  p_publish_first_week boolean default false
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
  v_week_id uuid;
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

  if coalesce(p_publish_first_week, false) then
    select pw.id
    into v_week_id
    from public.program_phases pp
    join public.program_weeks pw on pw.program_phase_id = pp.id
    where pp.program_id = p_program_id
    order by pp.position, pw.week_number
    limit 1;

    if v_week_id is null then
      raise exception 'Program week not found';
    end if;

    perform public.publish_program_week(v_week_id, p_starts_on, array[v_client_id]);
  end if;

  return jsonb_build_object(
    'goal_id', v_goal_id,
    'program_assignment_id', v_assignment_id
  );
end;
$$;

revoke all on function public.start_own_program(uuid, date, text, public.goal_type, boolean, boolean) from public;
grant execute on function public.start_own_program(uuid, date, text, public.goal_type, boolean, boolean) to authenticated;
