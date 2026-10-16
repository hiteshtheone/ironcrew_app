-- Trainers previously stored a display name only on profiles.full_name.
-- Split that into first and last name so trainers can edit them like clients.

alter table public.trainers
  add column first_name text,
  add column last_name text;

update public.trainers as trainer
set
  first_name = left(split_part(btrim(profile.full_name), ' ', 1), 80),
  last_name = nullif(left(btrim(regexp_replace(btrim(profile.full_name), '^\S+', '')), 80), '')
from public.profiles as profile
where profile.id = trainer.id;

update public.trainers
set first_name = 'Trainer'
where first_name is null or char_length(btrim(first_name)) = 0;

alter table public.trainers
  alter column first_name set not null;

alter table public.trainers
  add constraint trainers_first_name_length
  check (char_length(trim(first_name)) between 1 and 80);

alter table public.trainers
  add constraint trainers_last_name_length
  check (last_name is null or char_length(trim(last_name)) between 1 and 80);
