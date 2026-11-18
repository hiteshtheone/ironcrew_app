---
name: create-plan
description: >-
  Build a shared multi-week training program in this repo: phases, weeks, and
  days that place catalog workouts. Use when the user asks to create, change,
  or seed a program, plan, phase, or week, including a running plan, 5K, 10K,
  or other endurance block. Single gym sessions stay with the general-exercise
  skill.
---

# Create a plan

A program is phases, then weeks, then days. Days name workouts. Workouts name exercises from `Projects/ironcrew/devshell/seed_gym_exercises.py`. `Projects/ironcrew/catalog/beginner-10k.yaml` is the pattern. Read it before writing a program. Follow `.cursor/skills/general-exercise/SKILL.md` for a workout's blocks.

One catalog file holds the program and the workouts it introduces. Do not add an `exercises:` list.

## Ask first

Before writing a new program, ask how many phases it has and how many weeks are in each phase. Skip the question only when the request already states both.

If the user ignores the phases, write one phase. Put every week in that phase. `estimated_duration_weeks` is still the total number of weeks.

## Workouts

Name the session, not the plan or the week. `Easy Run 5 km` and `4 x 400m Speed Bursts` are names. `10K Week 1 Easy Run` is not.

Reuse one workout wherever the prescription matches. Do not copy it once per week.

Distances are kilometers. Store them as `prescribed_distance_meters` (`5 km` is `5000`). A short repeat can stay in meters, such as `400` or `100`. Say the distance in km in the name, the instructions, and the week notes. Do not write miles.

Order each workout: warmup, the efforts, then cooldown. Exercise names stay unique inside one workout, so an easy opener and the fast repeats are different exercises. The jog between repeats is `rest`, not a second copy of the easy exercise.

The description states the equipment, then a seeded substitute. For an outdoor run, write `use Treadmill instead of <prescribed exercise>` for every running exercise in that workout.

`distance_time` uses `prescribed_distance_meters`. `weight_reps` and `reps` use `sets`, `reps`, and `rest`. `time` uses `prescribed_duration_seconds`.

Add a seed exercise only when the user asks for a new library exercise. Copy the `Exercise(...)` line in `build_exercises()`. Set `tracking_type` to `distance_time` for a run. Raise the expected exercise count in `validate_exercises`, the argparse description, and `devshell/tests/test_seed_gym_exercises.py` to the new length.

A day may name a workout defined in another catalog file, copied exactly, such as `Beginner Lower Body`. Say in the README that those catalogs must be applied first.

## Program

```yaml
programs:
  - name: 8 Week 10K Beginner Running
    description: >
      An eight-week beginner plan to run a 10 km.
    status: active
    estimated_duration_weeks: 8
    phases:
      - name: Base Building & Adaptation
        description: >
          Primary goal: ... Training focus: ... Key milestone: ...
        weeks:
          - week_number: 1
            name: Week 1 — easy base
            notes: The long run is 4 km.
            days:
              - day: 1
                workout: Easy Run 3 km
              - day: 7
                workout: Easy Run 4 km
```

- `estimated_duration_weeks` is the number of weeks in the plan.
- Put the phase goal, focus, and milestone in `description`. The programs panel shows that text.
- `week_number` is the plan week, so week 4 of an eight-week plan is `4` inside its phase. It must be unique inside the phase.
- `name` is a short week label. `notes` are that week's detail. The panel shows both.
- `day` is 1–7 from the start date chosen at publish. Omit rest days.
- Put goal words in the program name or description (`10k`, `run`, `endurance`) so starter suggestions can match them.

## Check and document

From `Projects/ironcrew`:

```sh
npm run catalog -- validate catalog/<file>.yaml
./node_modules/.bin/tsx --test scripts/catalog/<file>.test.ts
```

Follow `scripts/catalog/beginner-10k.test.ts`. The test reads the catalog and `seed_gym_exercises.py`, asserts there is no `exercises` list, asserts every block exercise name exists in the seed, and asserts workout names do not contain a week. Assert the phase lengths, the week numbers, and the milestone distances.

When a new catalog file is added, append apply steps to `Projects/ironcrew/README.md` in the existing comment style. Seed first, then validate, then apply. Apply again to replace blocks on the same shared names and rebuild the phases. Leave trainer- and client-owned rows untouched. Do not apply unless the user asks.

```sh
PYTHONPATH=devshell python devshell/seed_gym_exercises.py
npm run catalog -- validate catalog/<file>.yaml
npm run catalog -- apply catalog/<file>.yaml
```
