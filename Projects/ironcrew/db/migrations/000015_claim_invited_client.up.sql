-- A trainer can create a client before that person has an account. When they
-- sign up with the same email, link that row and create a client profile so
-- they go straight to the dashboard instead of the role form.
--
-- Self-serve sign-ups have no matching trainer_clients row, so this returns
-- false and onboarding still asks them to choose a role.

create or replace function public.claim_invited_client()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_client_id uuid;
  v_first_name text;
  v_last_name text;
  v_full_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    return true;
  end if;

  select lower(btrim(email)) into v_email from auth.users where id = v_user_id;

  if v_email is null or v_email = '' then
    return false;
  end if;

  select c.id, c.first_name, c.last_name
  into v_client_id, v_first_name, v_last_name
  from public.clients as c
  where lower(c.email) = v_email
    and c.profile_id is null
    and exists (
      select 1
      from public.trainer_clients as tc
      where tc.client_id = c.id
    )
  for update;

  if v_client_id is null then
    return false;
  end if;

  v_full_name := left(btrim(concat_ws(' ', v_first_name, v_last_name)), 120);

  insert into public.profiles (id, role, full_name)
  values (v_user_id, 'client', v_full_name);

  update public.clients
  set profile_id = v_user_id
  where id = v_client_id
    and profile_id is null;

  return true;
exception
  when unique_violation then
    -- A concurrent sign-in already created this profile.
    if exists (select 1 from public.profiles where id = v_user_id) then
      return true;
    end if;
    raise;
end;
$$;

revoke all on function public.claim_invited_client() from public;
grant execute on function public.claim_invited_client() to authenticated;
