-- The catalog CLI upserts a shared program or workout by name. Private
-- libraries are unchanged: the same name can still exist for each owner.
-- Shared exercises are already unique through exercises_owner_name_key.

create unique index programs_shared_name_key
  on public.programs (name)
  where trainer_id is null and owner_client_id is null;

create unique index workouts_shared_name_key
  on public.workouts (name)
  where trainer_id is null and owner_client_id is null;
