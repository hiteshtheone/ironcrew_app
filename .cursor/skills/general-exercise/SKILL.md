---
name: general-exercise
description: >-
  Build shared gym workouts for this repo from exercises already defined in
  seed_gym_exercises.py. Use when the user asks to create, change, or seed a
  workout, session, or exercise catalog, including beginner, intermediate, or
  advanced upper-body, lower-body, full-body, or core sessions. A multi-week
  program with phases uses the create-plan skill.
---

# General exercise

Shared workouts live in `Projects/ironcrew/catalog/*.yaml`. They name exercises from `Projects/ironcrew/devshell/seed_gym_exercises.py` and do not create exercises. `Projects/ironcrew/catalog/upper-body.yaml` is the pattern. Read it before writing a workout.

## Build a workout

1. Take exercise names from `build_exercises()` in `seed_gym_exercises.py`. Copy the name exactly. Pick exercises whose `body_parts` match the session.
2. Do not add an `exercises:` list. Do not invent a movement. Add a seed exercise only when the user asks for a new library exercise.
3. Write one catalog file per body part or goal, for example `catalog/upper-body.yaml`.
4. When the user asks for a general session and does not name a single level, write three workouts: Beginner, Intermediate, and Advanced. Volume rises with the level.

| Level | Movements | Sets | Session |
|---|---|---|---|
| Beginner | Supported, dumbbell, cable, or bodyweight | 2–3 | about 40 minutes |
| Intermediate | Main barbell lifts, then isolation | 3–4 | about 55 minutes |
| Advanced | Heavier compounds and harder variations | 3–5 | about 70 minutes |

5. Order each workout: warmup, compounds, then isolation, then cooldown. Keep exercise names unique inside one workout. Rest is longer on compounds than on isolation.
6. The description states the equipment, then a seeded substitute for each piece that might be missing. Name the replacement with `use <seeded exercise> instead of <prescribed exercise>`. Skip an exercise only when the seed has no substitute.
7. Match tracking. `weight_reps` and `reps` use `sets`, `reps`, and `rest`. `time` uses `prescribed_duration_seconds`. `distance_time` uses `prescribed_distance_meters`.

```yaml
workouts:
  - name: Beginner Upper Body
    description: >
      Equipment: a pair of dumbbells, a bench, and a cable station.
      If the cable station is unavailable, use Pull-Up instead of Lat Pulldown.
    minutes: 40
    blocks:
      - type: warmup
        title: Warm up
        instructions: Move the shoulders, then do two easy sets of the first press. Stop if a joint hurts.
      - exercise: Lat Pulldown
        sets: 3
        reps: 8-12
        rest: 90
      - type: cooldown
        title: Cool down
        instructions: Shake out the arms. Stretch the chest and the lats gently.
```

## Check and document

From `Projects/ironcrew`:

```sh
npm run catalog -- validate catalog/<file>.yaml
./node_modules/.bin/tsx --test scripts/catalog/<file>.test.ts
```

The test reads the catalog and `seed_gym_exercises.py`, asserts there is no `exercises` list, and asserts every block exercise name exists in the seed. Follow `scripts/catalog/upper-body.test.ts`.

When a new catalog file is added, append apply steps to `Projects/ironcrew/README.md` in the existing comment style. Seed first, then validate, then apply. Apply again to replace blocks on the same shared names. Leave trainer- and client-owned rows untouched. Do not apply unless the user asks.

```sh
PYTHONPATH=devshell python devshell/seed_gym_exercises.py
npm run catalog -- validate catalog/<file>.yaml
npm run catalog -- apply catalog/<file>.yaml
```
