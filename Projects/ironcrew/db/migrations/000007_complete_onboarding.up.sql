-- First-login onboarding: a signed-in user without a profile chooses to be a
-- trainer or a client. All rows are created atomically in one call.
--
--   trainer -> profiles + trainers
--   client  -> profiles + clients (no trainer_clients row, so no trainer yet)
--
-- A client row that a trainer pre-created with the same email (profile_id is null)
-- is linked instead of duplicated, keeping its existing trainer relationship.

create or replace function public.complete_onboarding(
  p_role public.profile_role,
  p_first_name text,
  p_last_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_first_name text := nullif(btrim(p_first_name), '');
  v_last_name text := nullif(btrim(p_last_name), '');
  v_full_name text;
  v_email text;
  v_client_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_role is null then
    raise exception 'A role is required';
  end if;

  if v_first_name is null or char_length(v_first_name) > 80 then
    raise exception 'First name must be between 1 and 80 characters';
  end if;

  if v_last_name is not null and char_length(v_last_name) > 80 then
    raise exception 'Last name must be 80 characters or fewer';
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'Onboarding has already been completed for this account'
      using errcode = '23505';
  end if;

  v_full_name := left(btrim(concat_ws(' ', v_first_name, v_last_name)), 120);

  insert into public.profiles (id, role, full_name)
  values (v_user_id, p_role, v_full_name);

  if p_role = 'trainer' then
    insert into public.trainers (id, first_name, last_name)
    values (v_user_id, v_first_name, v_last_name);

    return jsonb_build_object('role', 'trainer');
  end if;

  select lower(btrim(email)) into v_email from auth.users where id = v_user_id;

  -- Link a trainer-invited client row with the same email, if there is one.
  if v_email is not null then
    update public.clients
    set profile_id = v_user_id
    where lower(email) = v_email and profile_id is null
    returning id into v_client_id;
  end if;

  if v_client_id is null then
    -- The email is unique across clients; skip it if another client already owns it.
    if v_email is not null
       and exists (select 1 from public.clients where lower(email) = v_email) then
      v_email := null;
    end if;

    insert into public.clients (profile_id, first_name, last_name, email)
    values (v_user_id, v_first_name, v_last_name, v_email)
    returning id into v_client_id;
  end if;

  return jsonb_build_object('role', 'client', 'client_id', v_client_id);
end;
$$;

revoke all on function public.complete_onboarding(public.profile_role, text, text) from public;
grant execute on function public.complete_onboarding(public.profile_role, text, text) to authenticated;
