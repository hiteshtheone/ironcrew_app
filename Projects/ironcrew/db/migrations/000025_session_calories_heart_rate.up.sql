-- Optional calories burnt and average heart rate for a logged workout.
-- Set-level heart rate on an exercise stays separate.

alter table public.workout_sessions
  add column calories integer,
  add constraint workout_sessions_calories_nonnegative
    check (calories is null or calories >= 0),
  add column heart_rate_bpm integer,
  add constraint workout_sessions_heart_rate_bpm_nonnegative
    check (heart_rate_bpm is null or heart_rate_bpm >= 0);

comment on column public.workout_sessions.calories is
  'Calories burnt during this session, when the client entered them.';

comment on column public.workout_sessions.heart_rate_bpm is
  'Average heart rate in beats per minute for this session, when the client entered it.';
