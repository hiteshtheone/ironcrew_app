-- Muscles and body parts are closed lists. Primary stays one muscle.
-- Secondary muscles and body parts are lists. Existing free text maps when
-- it matches a slug or label, and anything else is cleared.

create type public.muscle as enum (
  'abdominals',
  'biceps',
  'chest',
  'forearms',
  'lats',
  'lower_back',
  'neck',
  'shoulders',
  'traps',
  'triceps',
  'upper_back',
  'abductors',
  'adductors',
  'calves',
  'glutes',
  'hamstrings',
  'quadriceps',
  'cardio',
  'full_body',
  'other'
);

create type public.body_part as enum (
  'upper_body',
  'lower_body',
  'full_body',
  'core_and_midsections'
);

create or replace function public.muscle_from_text(p_value text)
returns public.muscle
language sql
immutable
set search_path = public
as $$
  select case trim(both '_' from regexp_replace(lower(btrim(coalesce(p_value, ''))), '[^a-z]+', '_', 'g'))
    when 'abdominals' then 'abdominals'::public.muscle
    when 'biceps' then 'biceps'::public.muscle
    when 'chest' then 'chest'::public.muscle
    when 'forearms' then 'forearms'::public.muscle
    when 'lats' then 'lats'::public.muscle
    when 'lower_back' then 'lower_back'::public.muscle
    when 'neck' then 'neck'::public.muscle
    when 'shoulders' then 'shoulders'::public.muscle
    when 'traps' then 'traps'::public.muscle
    when 'triceps' then 'triceps'::public.muscle
    when 'upper_back' then 'upper_back'::public.muscle
    when 'abductors' then 'abductors'::public.muscle
    when 'adductors' then 'adductors'::public.muscle
    when 'calves' then 'calves'::public.muscle
    when 'glutes' then 'glutes'::public.muscle
    when 'hamstrings' then 'hamstrings'::public.muscle
    when 'quadriceps' then 'quadriceps'::public.muscle
    when 'cardio' then 'cardio'::public.muscle
    when 'full_body' then 'full_body'::public.muscle
    when 'other' then 'other'::public.muscle
    else null
  end;
$$;

alter table public.exercises
  drop constraint if exists exercises_secondary_muscle_group_trimmed,
  drop constraint if exists exercises_muscle_groups_distinct;

alter table public.exercises
  alter column primary_muscle_group type public.muscle
  using public.muscle_from_text(primary_muscle_group);

alter table public.exercises
  alter column secondary_muscle_group type public.muscle[]
  using (
    case
      when public.muscle_from_text(secondary_muscle_group) is null
        or public.muscle_from_text(secondary_muscle_group) is not distinct from primary_muscle_group
        then '{}'::public.muscle[]
      else array[public.muscle_from_text(secondary_muscle_group)]
    end
  ),
  alter column secondary_muscle_group set default '{}'::public.muscle[],
  alter column secondary_muscle_group set not null;

alter table public.exercises
  rename column secondary_muscle_group to secondary_muscle_groups;

alter table public.exercises
  add column body_parts public.body_part[] not null default '{}'::public.body_part[];

create or replace function public.secondary_muscle_groups_valid(
  p_primary public.muscle,
  p_groups public.muscle[]
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_groups is not null
    and cardinality(p_groups) = (select count(distinct muscle) from unnest(p_groups) as muscle)
    and (p_primary is null or not (p_primary = any (p_groups)));
$$;

create or replace function public.body_parts_valid(p_parts public.body_part[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_parts is not null
    and cardinality(p_parts) = (select count(distinct part) from unnest(p_parts) as part);
$$;

alter table public.exercises
  add constraint exercises_muscle_groups_distinct check (
    public.secondary_muscle_groups_valid(primary_muscle_group, secondary_muscle_groups)
  ),
  add constraint exercises_body_parts_valid check (
    public.body_parts_valid(body_parts)
  );

comment on column public.exercises.primary_muscle_group is
  'Primary muscle. Null until the exercise is classified.';
comment on column public.exercises.secondary_muscle_groups is
  'Secondary muscles, alongside primary_muscle_group. Empty when none are set.';
comment on column public.exercises.body_parts is
  'Body parts this exercise trains. Empty when none are set.';
