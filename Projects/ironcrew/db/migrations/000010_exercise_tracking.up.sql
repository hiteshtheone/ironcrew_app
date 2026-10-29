-- An exercise declares which set fields a log records. Preset types store
-- exactly their parameter list. Custom stores any non-empty unique subset.
-- Existing exercises stay on the fields the log form already shows.

create type public.exercise_tracking_type as enum (
  'time',
  'reps',
  'weight',
  'weight_reps',
  'distance',
  'distance_weight',
  'distance_time',
  'reps_height',
  'custom'
);

create type public.exercise_tracking_parameter as enum (
  'time',
  'reps',
  'weight',
  'distance',
  'height'
);

create or replace function public.exercise_tracking_parameters_valid(
  p_type public.exercise_tracking_type,
  p_parameters public.exercise_tracking_parameter[]
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_distinct public.exercise_tracking_parameter[];
  v_expected public.exercise_tracking_parameter[];
begin
  if p_parameters is null or cardinality(p_parameters) = 0 then
    return false;
  end if;

  select coalesce(array_agg(parameter order by parameter), '{}'::public.exercise_tracking_parameter[])
  into v_distinct
  from (
    select distinct parameter
    from unnest(p_parameters) as parameter
  ) items;

  if cardinality(v_distinct) <> cardinality(p_parameters) then
    return false;
  end if;

  if p_type = 'custom' then
    return true;
  end if;

  v_expected := case p_type
    when 'time' then array['time']::public.exercise_tracking_parameter[]
    when 'reps' then array['reps']::public.exercise_tracking_parameter[]
    when 'weight' then array['weight']::public.exercise_tracking_parameter[]
    when 'weight_reps' then array['weight', 'reps']::public.exercise_tracking_parameter[]
    when 'distance' then array['distance']::public.exercise_tracking_parameter[]
    when 'distance_weight' then array['distance', 'weight']::public.exercise_tracking_parameter[]
    when 'distance_time' then array['distance', 'time']::public.exercise_tracking_parameter[]
    when 'reps_height' then array['reps', 'height']::public.exercise_tracking_parameter[]
  end;

  select coalesce(array_agg(parameter order by parameter), '{}'::public.exercise_tracking_parameter[])
  into v_expected
  from (
    select distinct parameter
    from unnest(v_expected) as parameter
  ) items;

  return v_distinct = v_expected;
end;
$$;

alter table public.exercises
  add column tracking_type public.exercise_tracking_type not null default 'custom',
  add column tracking_parameters public.exercise_tracking_parameter[] not null
    default array['weight', 'reps', 'time', 'distance']::public.exercise_tracking_parameter[],
  add column secondary_muscle_group text,
  add constraint exercises_secondary_muscle_group_trimmed check (
    secondary_muscle_group is null
    or (
      secondary_muscle_group = trim(secondary_muscle_group)
      and char_length(secondary_muscle_group) between 1 and 80
    )
  ),
  add constraint exercises_tracking_parameters_valid check (
    public.exercise_tracking_parameters_valid(tracking_type, tracking_parameters)
  );

comment on column public.exercises.tracking_type is
  'Which set fields this exercise records. Custom uses tracking_parameters.';
comment on column public.exercises.tracking_parameters is
  'Parameters recorded on each set. Presets must match tracking_type exactly.';
comment on column public.exercises.secondary_muscle_group is
  'Optional secondary muscle group, alongside primary_muscle_group.';

alter table public.exercise_results
  add column height_cm numeric(8,2),
  add constraint exercise_results_height_cm_nonnegative check (height_cm is null or height_cm >= 0);

comment on column public.exercise_results.height_cm is
  'Jump or step height in centimeters, when the exercise tracks height.';
