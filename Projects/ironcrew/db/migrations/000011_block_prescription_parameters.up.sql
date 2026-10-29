-- Prescription fields for the tracking parameters that were not columns yet.
-- save_workout and duplicate_workout copy them with the rest of the block.

alter table public.workout_blocks
  add column prescribed_duration_seconds integer,
  add column prescribed_distance_meters numeric(12,2),
  add column prescribed_height_cm numeric(8,2),
  add constraint workout_blocks_prescribed_duration_seconds_nonnegative
    check (prescribed_duration_seconds is null or prescribed_duration_seconds >= 0),
  add constraint workout_blocks_prescribed_distance_meters_nonnegative
    check (prescribed_distance_meters is null or prescribed_distance_meters >= 0),
  add constraint workout_blocks_prescribed_height_cm_nonnegative
    check (prescribed_height_cm is null or prescribed_height_cm >= 0);

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
  v_duration integer;
  v_distance numeric;
  v_height numeric;
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
    v_duration := public.optional_nonnegative_int(v_block -> 'prescribed_duration_seconds', 'prescribed_duration_seconds');
    v_distance := public.optional_nonnegative_numeric(v_block -> 'prescribed_distance_meters', 'prescribed_distance_meters');
    v_height := public.optional_nonnegative_numeric(v_block -> 'prescribed_height_cm', 'prescribed_height_cm');

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
    v_duration := public.optional_nonnegative_int(v_block -> 'prescribed_duration_seconds', 'prescribed_duration_seconds');
    v_distance := public.optional_nonnegative_numeric(v_block -> 'prescribed_distance_meters', 'prescribed_distance_meters');
    v_height := public.optional_nonnegative_numeric(v_block -> 'prescribed_height_cm', 'prescribed_height_cm');

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
      prescribed_duration_seconds,
      prescribed_distance_meters,
      prescribed_height_cm
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
      v_rest,
      v_duration,
      v_distance,
      v_height
    );
  end loop;

  return jsonb_build_object('id', p_workout_id);
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
