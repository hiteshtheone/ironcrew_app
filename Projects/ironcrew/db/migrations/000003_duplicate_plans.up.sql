-- Independent copies of a goal, workout, or program. A copied program
-- gets its own workouts so later edits do not change the source.

create or replace function public.duplicate_goal(p_goal_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_goal public.goals%rowtype;
  v_goal_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_goal from public.goals where id = p_goal_id;
  if not found then
    raise exception 'Goal not found';
  end if;

  if not public.manages_client(v_goal.client_id) then
    raise exception 'You do not manage this client' using errcode = '42501';
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
    v_goal.client_id,
    auth.uid(),
    left('Copy of ' || v_goal.title, 160),
    v_goal.goal_type,
    v_goal.status,
    v_goal.target_value,
    v_goal.target_unit,
    v_goal.target_date,
    v_goal.notes
  )
  returning id into v_goal_id;

  return jsonb_build_object('id', v_goal_id);
end;
$$;

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
    name,
    description,
    estimated_duration_minutes,
    is_template
  ) values (
    auth.uid(),
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
    name,
    description,
    status,
    estimated_duration_weeks
  ) values (
    auth.uid(),
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
      from public.exercises
      where id = v_exercise_id
        and (trainer_id = auth.uid() or trainer_id is null)
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

create or replace function public.optional_positive_int(p_value jsonb, p_label text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_number integer;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) not in ('number', 'string') then
    raise exception '% must be an integer', p_label;
  end if;
  begin
    v_number := (p_value #>> '{}')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception '% must be an integer', p_label;
  end;
  if v_number <= 0 then
    raise exception '% must be greater than 0', p_label;
  end if;
  if (p_value #>> '{}')::numeric <> v_number then
    raise exception '% must be an integer', p_label;
  end if;
  return v_number;
end;
$$;

create or replace function public.optional_nonnegative_int(p_value jsonb, p_label text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_number integer;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) not in ('number', 'string') then
    raise exception '% must be an integer', p_label;
  end if;
  begin
    v_number := (p_value #>> '{}')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception '% must be an integer', p_label;
  end;
  if v_number < 0 then
    raise exception '% must be zero or greater', p_label;
  end if;
  if (p_value #>> '{}')::numeric <> v_number then
    raise exception '% must be an integer', p_label;
  end if;
  return v_number;
end;
$$;

create or replace function public.optional_nonnegative_numeric(p_value jsonb, p_label text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_number numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) not in ('number', 'string') then
    raise exception '% must be a number', p_label;
  end if;
  begin
    v_number := (p_value #>> '{}')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception '% must be a number', p_label;
  end;
  if v_number < 0 then
    raise exception '% must be zero or greater', p_label;
  end if;
  return v_number;
end;
$$;

revoke all on function public.duplicate_goal(uuid) from public;
grant execute on function public.duplicate_goal(uuid) to authenticated;

revoke all on function public.duplicate_workout(uuid) from public;
grant execute on function public.duplicate_workout(uuid) to authenticated;

revoke all on function public.duplicate_program(uuid) from public;
grant execute on function public.duplicate_program(uuid) to authenticated;

revoke all on function public.save_workout(uuid, text, text, integer, jsonb) from public;
grant execute on function public.save_workout(uuid, text, text, integer, jsonb) to authenticated;

revoke all on function public.optional_positive_int(jsonb, text) from public;
grant execute on function public.optional_positive_int(jsonb, text) to authenticated;

revoke all on function public.optional_nonnegative_int(jsonb, text) from public;
grant execute on function public.optional_nonnegative_int(jsonb, text) to authenticated;

revoke all on function public.optional_nonnegative_numeric(jsonb, text) from public;
grant execute on function public.optional_nonnegative_numeric(jsonb, text) to authenticated;
