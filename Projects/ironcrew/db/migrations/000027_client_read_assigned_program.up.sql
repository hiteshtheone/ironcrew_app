-- A client can read the workouts, blocks, and exercises on a program their
-- trainer assigned while that assignment is still active. Writes stay on the
-- owner policies.

create policy workouts_client_program_select on public.workouts
  for select to authenticated
  using (
    exists (
      select 1
      from public.program_workouts pw
      join public.program_weeks wk on wk.id = pw.program_week_id
      join public.program_phases pp on pp.id = wk.program_phase_id
      join public.program_assignments pa on pa.program_id = pp.program_id
      where pw.workout_id = workouts.id
        and pa.status in ('scheduled', 'in_progress')
        and public.is_client(pa.client_id)
    )
  );

create policy workout_blocks_client_program_select on public.workout_blocks
  for select to authenticated
  using (
    exists (
      select 1
      from public.program_workouts pw
      join public.program_weeks wk on wk.id = pw.program_week_id
      join public.program_phases pp on pp.id = wk.program_phase_id
      join public.program_assignments pa on pa.program_id = pp.program_id
      where pw.workout_id = workout_blocks.workout_id
        and pa.status in ('scheduled', 'in_progress')
        and public.is_client(pa.client_id)
    )
  );

create policy exercises_client_program_select on public.exercises
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_blocks wb
      join public.program_workouts pw on pw.workout_id = wb.workout_id
      join public.program_weeks wk on wk.id = pw.program_week_id
      join public.program_phases pp on pp.id = wk.program_phase_id
      join public.program_assignments pa on pa.program_id = pp.program_id
      where wb.exercise_id = exercises.id
        and pa.status in ('scheduled', 'in_progress')
        and public.is_client(pa.client_id)
    )
  );
