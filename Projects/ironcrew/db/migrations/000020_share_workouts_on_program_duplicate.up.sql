-- A copied program keeps the source workouts. Phases, weeks, and slots are
-- new; each slot points at the same workout, so exercises are not copied
-- either. Editing a shared workout changes every program that uses it.

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
        insert into public.program_workouts (
          program_week_id,
          workout_id,
          day_number,
          position,
          title_override,
          notes
        ) values (
          v_week_id,
          v_slot.workout_id,
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
