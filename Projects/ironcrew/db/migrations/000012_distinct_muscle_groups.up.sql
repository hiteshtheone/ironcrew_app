-- Secondary muscle group cannot be the same as the primary one.
-- Existing rows have a null secondary group, so this does not reject them.

alter table public.exercises
  add constraint exercises_muscle_groups_distinct check (
    secondary_muscle_group is null
    or primary_muscle_group is null
    or lower(btrim(primary_muscle_group)) <> lower(btrim(secondary_muscle_group))
  );
