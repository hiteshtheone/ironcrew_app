-- A signed-in person can download the rows this account holds and can delete
-- the login. Client rows are removed, including workouts logged on them.
-- A trainer who still has clients, assignments, or logged sessions on their
-- library is refused so those clients are not left pointing at a deleted login.

create or replace function public.export_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select id into v_client_id
  from public.clients
  where profile_id = v_user_id;

  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user_id),
    'trainer', (select to_jsonb(t) from public.trainers t where t.id = v_user_id),
    'client', (select to_jsonb(c) from public.clients c where c.id = v_client_id),
    'trained_clients', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at)
      from public.clients c
      join public.trainer_clients tc on tc.client_id = c.id
      where tc.trainer_id = v_user_id
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at)
      from public.goals g
      where g.client_id = v_client_id
         or g.client_id in (
           select tc.client_id from public.trainer_clients tc where tc.trainer_id = v_user_id
         )
    ), '[]'::jsonb),
    'measurements', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.recorded_on)
      from public.measurements m
      where m.client_id = v_client_id
         or m.recorded_by = v_user_id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at)
      from public.client_notes n
      where n.client_id = v_client_id or n.author_id = v_user_id
    ), '[]'::jsonb),
    'programs', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at)
      from public.programs p
      where p.trainer_id = v_user_id or p.owner_client_id = v_client_id
    ), '[]'::jsonb),
    'workout_sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.started_at)
      from public.workout_sessions s
      where s.client_id = v_client_id
    ), '[]'::jsonb),
    'exercise_results', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.exercise_results r
      join public.workout_sessions s on s.id = r.workout_session_id
      where s.client_id = v_client_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.profile_role;
  v_client_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  select id into v_client_id from public.clients where profile_id = v_user_id;

  if v_role = 'trainer' then
    if exists (select 1 from public.trainer_clients where trainer_id = v_user_id)
       or exists (select 1 from public.program_assignments where assigned_by_trainer_id = v_user_id)
       or exists (select 1 from public.workout_assignments where assigned_by_trainer_id = v_user_id) then
      raise exception 'ACCOUNT_HAS_CLIENTS Remove your clients before deleting this account. Their plans still reference you.'
        using errcode = '23503';
    end if;

    if exists (
      select 1
      from public.workout_sessions s
      join public.workouts w on w.id = s.workout_id
      where w.trainer_id = v_user_id
    ) or exists (
      select 1
      from public.exercise_results r
      join public.exercises e on e.id = r.exercise_id
      where e.trainer_id = v_user_id
    ) then
      raise exception 'ACCOUNT_IN_USE Workout history still uses your library, so this account cannot be deleted yet.'
        using errcode = '23503';
    end if;
  end if;

  if v_client_id is not null then
    delete from public.exercise_results r
    using public.workout_sessions s
    where r.workout_session_id = s.id
      and s.client_id = v_client_id;

    delete from public.exercise_results r
    using public.exercises e
    where r.exercise_id = e.id
      and e.owner_client_id = v_client_id;

    delete from public.workout_sessions where client_id = v_client_id;
    delete from public.workout_assignments where client_id = v_client_id;

    delete from public.program_workouts pw
    using public.workouts w
    where pw.workout_id = w.id
      and w.owner_client_id = v_client_id;

    delete from public.programs where owner_client_id = v_client_id;
    delete from public.workouts where owner_client_id = v_client_id;
    delete from public.exercises where owner_client_id = v_client_id;
    delete from public.clients where id = v_client_id;
  end if;

  delete from public.client_notes where author_id = v_user_id;

  if v_role = 'trainer' then
    delete from public.program_workouts pw
    using public.workouts w
    where pw.workout_id = w.id
      and w.trainer_id = v_user_id;

    delete from public.programs where trainer_id = v_user_id;
    delete from public.workouts where trainer_id = v_user_id;
    delete from public.exercises where trainer_id = v_user_id;
  end if;

  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.export_own_account() from public;
grant execute on function public.export_own_account() to authenticated;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
