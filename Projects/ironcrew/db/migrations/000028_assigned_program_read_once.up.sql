-- 000027 checks the program tree once per workout, block, and exercise.
-- A library read then scans that tree for every system row and hits the
-- statement timeout. These helpers resolve the caller's active assignments
-- once per statement. The policies only test membership in that small set.

create or replace function public.client_assigned_workout_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct pw.workout_id
  from public.clients c
  join public.program_assignments pa
    on pa.client_id = c.id
   and pa.status in ('scheduled', 'in_progress')
  join public.program_phases pp on pp.program_id = pa.program_id
  join public.program_weeks wk on wk.program_phase_id = pp.id
  join public.program_workouts pw on pw.program_week_id = wk.id
  where c.profile_id = (select auth.uid())
$$;

create or replace function public.client_assigned_exercise_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct wb.exercise_id
  from public.clients c
  join public.program_assignments pa
    on pa.client_id = c.id
   and pa.status in ('scheduled', 'in_progress')
  join public.program_phases pp on pp.program_id = pa.program_id
  join public.program_weeks wk on wk.program_phase_id = pp.id
  join public.program_workouts pw on pw.program_week_id = wk.id
  join public.workout_blocks wb on wb.workout_id = pw.workout_id
  where c.profile_id = (select auth.uid())
    and wb.exercise_id is not null
$$;

revoke all on function public.client_assigned_workout_ids() from public;
revoke all on function public.client_assigned_exercise_ids() from public;
grant execute on function public.client_assigned_workout_ids() to authenticated;
grant execute on function public.client_assigned_exercise_ids() to authenticated;

drop policy workouts_client_program_select on public.workouts;
create policy workouts_client_program_select on public.workouts
  for select to authenticated
  using (id in (select public.client_assigned_workout_ids()));

drop policy workout_blocks_client_program_select on public.workout_blocks;
create policy workout_blocks_client_program_select on public.workout_blocks
  for select to authenticated
  using (workout_id in (select public.client_assigned_workout_ids()));

drop policy exercises_client_program_select on public.exercises;
create policy exercises_client_program_select on public.exercises
  for select to authenticated
  using (id in (select public.client_assigned_exercise_ids()));

-- The older exercise policy looks up blocks by exercise. This index keeps
-- that lookup from scanning every block.
create index if not exists workout_blocks_exercise_idx
  on public.workout_blocks (exercise_id)
  where exercise_id is not null;
