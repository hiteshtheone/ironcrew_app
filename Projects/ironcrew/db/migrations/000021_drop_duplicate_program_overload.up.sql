-- An older personal-library copy left duplicate_program(uuid, boolean) in
-- the database. PostgREST cannot choose between that and duplicate_program(uuid)
-- when the call only passes p_program_id. The app uses the one-argument
-- function. The workout overload is dropped for the same reason.

drop function if exists public.duplicate_program(uuid, boolean);
drop function if exists public.duplicate_workout(uuid, boolean);
