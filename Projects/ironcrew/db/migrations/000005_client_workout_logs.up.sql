-- A logged set belongs to a workout block. The same exercise can appear in more
-- than one block, and a warmup or notes block may have no exercise.

alter table public.exercise_results
  alter column exercise_id drop not null;

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  where con.conrelid = 'public.exercise_results'::regclass
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) ilike '%workout_session_id%'
    and pg_get_constraintdef(con.oid) ilike '%exercise_id%'
    and pg_get_constraintdef(con.oid) ilike '%set_number%';

  if v_name is null then
    raise exception 'Could not find the exercise result set uniqueness constraint';
  end if;

  execute format('alter table public.exercise_results drop constraint %I', v_name);
end $$;

alter table public.exercise_results
  add constraint exercise_results_has_target
  check (workout_block_id is not null or exercise_id is not null);

create unique index exercise_results_session_block_set_idx
  on public.exercise_results (workout_session_id, workout_block_id, set_number)
  nulls not distinct;
