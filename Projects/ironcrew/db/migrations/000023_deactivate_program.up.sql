-- End one active program assignment. The program template and its goal stay.
-- Upcoming workouts published from that assignment are cancelled. Completed,
-- skipped, and earlier sessions stay on the calendar.

create or replace function public.deactivate_program(
  p_program_id uuid,
  p_client_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_assigned_by_client_id uuid;
  v_assigned_by_trainer_id uuid;
  v_starts_on date;
  v_timezone text;
  v_today date;
  v_cancelled bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_program_id is null or p_client_id is null then
    raise exception 'program_id and client_id are required';
  end if;

  select id, assigned_by_client_id, assigned_by_trainer_id, starts_on
  into v_assignment_id, v_assigned_by_client_id, v_assigned_by_trainer_id, v_starts_on
  from public.program_assignments
  where program_id = p_program_id
    and client_id = p_client_id
    and status in ('scheduled', 'in_progress')
  for update;

  if v_assignment_id is null then
    raise exception 'Active program not found';
  end if;

  -- A client stops a program they started. A trainer stops one they assigned.
  if not (
    (public.is_client(p_client_id) and v_assigned_by_client_id = p_client_id)
    or (public.manages_client(p_client_id) and v_assigned_by_trainer_id is not null)
  ) then
    raise exception 'You cannot deactivate this program' using errcode = '42501';
  end if;

  select p.timezone
  into v_timezone
  from public.clients c
  join public.profiles p on p.id = c.profile_id
  where c.id = p_client_id;

  if v_timezone is null or not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'UTC';
  end if;

  v_today := (timezone(v_timezone, now()))::date;

  update public.program_assignments
  set status = 'cancelled',
      ends_on = greatest(v_today, v_starts_on)
  where id = v_assignment_id;

  update public.workout_assignments
  set status = 'cancelled'
  where program_assignment_id = v_assignment_id
    and status in ('scheduled', 'in_progress')
    and scheduled_for >= v_today;

  get diagnostics v_cancelled = row_count;

  return jsonb_build_object(
    'program_assignment_id', v_assignment_id,
    'cancelled_workouts', v_cancelled
  );
end;
$$;

revoke all on function public.deactivate_program(uuid, uuid) from public;
grant execute on function public.deactivate_program(uuid, uuid) to authenticated;
