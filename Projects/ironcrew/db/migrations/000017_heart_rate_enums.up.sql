-- Heart rate is a tracking parameter and a one-field preset. The new enum
-- values cannot be used until this migration commits, so the validation
-- function and workout save functions change in the next migration.

alter type public.exercise_tracking_type add value 'heart_rate';
alter type public.exercise_tracking_parameter add value 'heart_rate';

alter table public.workout_blocks
  add column prescribed_heart_rate_bpm integer,
  add constraint workout_blocks_prescribed_heart_rate_bpm_nonnegative
    check (prescribed_heart_rate_bpm is null or prescribed_heart_rate_bpm >= 0);

comment on column public.workout_blocks.prescribed_heart_rate_bpm is
  'Target heart rate in beats per minute, when the exercise tracks heart rate.';

alter table public.exercise_results
  add column heart_rate_bpm integer,
  add constraint exercise_results_heart_rate_bpm_nonnegative
    check (heart_rate_bpm is null or heart_rate_bpm >= 0);

comment on column public.exercise_results.heart_rate_bpm is
  'Heart rate in beats per minute, when the exercise tracks heart rate.';
