# Exercise fields

The catalog parser is `Projects/ironcrew/scripts/catalog/document.ts`. Writes go through `scripts/catalog/apply.ts`. The dashboard form is `components/dashboard/exercise-editor.tsx` and `lib/exercises/input.ts`.

## Catalog keys

Allowed keys: `id`, `name`, `muscle`, `primary_muscle_group`, `secondary_muscle_group`, `equipment`, `description`, `instructions`, `video_url`, `tracking_type`, `tracking_parameters`.

`muscle` and `primary_muscle_group` are the same column. A file uses one of them. `id` is a UUID and is optional; omit it and let the database assign one. A later file can point at the exercise with `exercise_id` instead of repeating the row.

`video_url` is optional text. The dashboard form does not edit equipment or video.

## Tracking

Preset types ignore a handwritten parameter list. The list is fixed:

| `tracking_type` | Parameters the log shows | Use for |
| --- | --- | --- |
| `weight_reps` | weight, reps | Loaded strength. Dashboard default. |
| `reps` | reps | Bodyweight reps |
| `time` | time | Holds and timed efforts |
| `weight` | weight | Load only |
| `distance` | distance | Distance only |
| `distance_time` | distance, time | Runs and conditioning with no heart rate |
| `distance_weight` | distance, weight | Loaded carries |
| `reps_height` | reps, height | Jumps |
| `heart_rate` | heart rate | Heart rate only |

`custom` requires `tracking_parameters` with at least one of `time`, `reps`, `weight`, `distance`, `height`, `heart_rate`. No repeats. A preset that is given a different list fails validation.

Heart rate on a run is `custom`, because `distance_time` cannot include `heart_rate` and the log hides a bpm target unless the exercise tracks it:

```yaml
exercises:
  - name: Steady Run
    muscle: legs
    equipment: none
    tracking_type: custom
    tracking_parameters: [distance, time, heart_rate]
    description: Conversational run with a heart-rate target.
    instructions: Stay at the heart rate written on the workout.
```

Parameters are `heart_rate` in YAML. The word "heart rate" with a space is not a parameter name.

## What a second apply does

`apply` finds the shared row by `id` when the file has one, otherwise by name. It updates name, description, instructions, both muscle groups, equipment, and video. `tracking_type` and `tracking_parameters` update only when the file sets them. An omitted tracking type on an existing row leaves the stored type in place.

## Dashboard create

`POST /api/exercises` accepts `name`, and optionally `description`, `instructions`, `tracking_type`, `tracking_parameters`, `primary_muscle_group`, and `secondary_muscle_group`. Missing `tracking_type` on create becomes `weight_reps`. A primary muscle group is optional on create and required on update. A duplicate name for that owner returns 409. A system row is rejected by row-level security. The editor locks system exercises and offers duplicate instead of edit.
