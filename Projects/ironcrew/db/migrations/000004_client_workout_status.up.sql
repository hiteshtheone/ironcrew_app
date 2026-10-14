-- Clients can mark their own workouts scheduled, in progress, completed, or skipped.
-- Cancellation and every other assignment column stay with the trainer.

create or replace function public.guard_client_workout_assignment_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_client(old.client_id) and not public.manages_client(old.client_id) then
    if old.status = 'cancelled' then
      raise exception 'You cannot update a cancelled workout' using errcode = '42501';
    end if;

    if new.status not in ('scheduled', 'in_progress', 'completed', 'skipped') then
      raise exception 'You cannot cancel a workout' using errcode = '42501';
    end if;

    if new.client_id is distinct from old.client_id
      or new.workout_id is distinct from old.workout_id
      or new.program_assignment_id is distinct from old.program_assignment_id
      or new.program_workout_id is distinct from old.program_workout_id
      or new.assigned_by_trainer_id is distinct from old.assigned_by_trainer_id
      or new.scheduled_for is distinct from old.scheduled_for
      or new.notes is distinct from old.notes
      or new.created_at is distinct from old.created_at
    then
      raise exception 'You can only update workout status' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_client_workout_assignment_update() from public;
grant execute on function public.guard_client_workout_assignment_update() to authenticated;

-- Runs before workout_assignments_set_updated_at, which stamps updated_at.
create trigger workout_assignments_guard_client_update
  before update on public.workout_assignments
  for each row
  execute function public.guard_client_workout_assignment_update();

create policy workout_assignments_client_update
  on public.workout_assignments
  for update
  to authenticated
  using (public.is_client(client_id) and status <> 'cancelled')
  with check (
    public.is_client(client_id)
    and status in ('scheduled', 'in_progress', 'completed', 'skipped')
  );
