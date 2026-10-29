-- Saving a workout used to delete every block and insert new ones. Logged sets
-- reference those blocks with on delete set null, and the unique index treats
-- null block ids as equal. A second set 1 in the same session then fails with
-- exercise_results_session_block_set_idx. Keep block ids on save, and delete a
-- set only when its block is actually removed.

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  where con.conrelid = 'public.exercise_results'::regclass
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%workout_blocks%';

  if v_name is not null then
    execute format('alter table public.exercise_results drop constraint %I', v_name);
  end if;
end $$;

alter table public.exercise_results
  add constraint exercise_results_workout_block_id_fkey
  foreign key (workout_block_id) references public.workout_blocks(id) on delete cascade;

drop index if exists public.exercise_results_session_block_set_idx;

create unique index exercise_results_session_block_set_idx
  on public.exercise_results (workout_session_id, workout_block_id, set_number)
  where workout_block_id is not null;

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
  v_block_id uuid;
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
  v_seen_ids uuid[] := '{}';
  v_kept uuid[] := '{}';
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

    v_block_id := null;
    if nullif(v_block ->> 'id', '') is not null and jsonb_typeof(v_block -> 'id') <> 'null' then
      begin
        v_block_id := (v_block ->> 'id')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'Block id must be a UUID';
      end;
      if v_block_id = any (v_seen_ids) then
        raise exception 'Each block can only be saved once';
      end if;
      v_seen_ids := v_seen_ids || v_block_id;
      if exists (
        select 1
        from public.workout_blocks
        where id = v_block_id
          and workout_id <> p_workout_id
      ) then
        raise exception 'Block not found';
      end if;
    end if;

    v_exercise_id := null;
    if nullif(v_block ->> 'exercise_id', '') is not null
      and jsonb_typeof(v_block -> 'exercise_id') <> 'null'
    then
      v_exercise_id := (v_block ->> 'exercise_id')::uuid;
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

  select coalesce(array_agg(b.id), array[]::uuid[])
  into v_kept
  from public.workout_blocks b
  where b.workout_id = p_workout_id
    and b.id = any (v_seen_ids);

  update public.workouts
  set
    name = trim(p_name),
    description = nullif(trim(p_description), ''),
    estimated_duration_minutes = p_duration_minutes
  where id = p_workout_id;

  -- Free the position numbers before blocks are renumbered.
  update public.workout_blocks
  set position = position + 100000
  where workout_id = p_workout_id;

  delete from public.workout_blocks
  where workout_id = p_workout_id
    and not (id = any (v_kept));

  for v_index in 0 .. jsonb_array_length(p_blocks) - 1 loop
    v_block := p_blocks -> v_index;
    v_block_type := v_block ->> 'block_type';
    v_block_id := null;
    if nullif(v_block ->> 'id', '') is not null and jsonb_typeof(v_block -> 'id') <> 'null' then
      v_block_id := (v_block ->> 'id')::uuid;
    end if;
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

    if v_block_id is not null and v_block_id = any (v_kept) then
      update public.workout_blocks
      set
        exercise_id = v_exercise_id,
        block_type = v_block_type::public.workout_block_type,
        position = v_index + 1,
        title = v_title,
        prescribed_sets = v_sets,
        prescribed_reps_min = v_reps_min,
        prescribed_reps_max = v_reps_max,
        prescribed_load = v_load,
        load_unit = v_load_unit,
        rest_seconds = v_rest,
        prescribed_duration_seconds = v_duration,
        prescribed_distance_meters = v_distance,
        prescribed_height_cm = v_height
      where id = v_block_id
        and workout_id = p_workout_id;
    else
      insert into public.workout_blocks (
        id,
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
        coalesce(v_block_id, gen_random_uuid()),
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
    end if;
  end loop;

  return jsonb_build_object('id', p_workout_id);
end;
$$;
