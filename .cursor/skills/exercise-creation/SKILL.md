---
name: exercise-creation
description: >-
  Add shared Ironcrew exercises as catalog YAML, with the tracking type, muscle
  groups, and names the log and library already expect. Use when the user
  invokes /exercise-creation or asks to create, add, or define exercises.
disable-model-invocation: true
---

# Exercise creation

Add shared exercises in a catalog YAML file. A shared exercise has both `trainer_id` and `owner_client_id` null. Every signed-in user can read it. The dashboard cannot create or edit it.

## When the brief is thin

A movement name alone is not enough. Ask for the missing pieces before writing a file:

- what one set records (load and reps, reps only, time, distance, heart rate)
- primary muscle group
- equipment, when it is not obvious
- the cue the athlete should follow, when the movement is easy to do wrong

Do not invent a library of extra movements.

## Where the exercise goes

- Shared library, usable from any program: one new file at `Projects/ironcrew/scripts/catalog/content/<topic>.yaml`. Leave `scripts/catalog/example.yaml` unchanged. The file lists `exercises` only.
- The exercise exists only inside a new training program: define it in that program's seeder. Follow [workout-program-creation](../workout-program-creation/SKILL.md). Do not also add a catalog row with the same name.
- A private exercise for one trainer or client: they create it in the dashboard. `POST /api/exercises` stamps their owner. Do not insert that row from a script.

## File

```yaml
exercises:
  - name: Romanian Deadlift
    muscle: legs
    secondary_muscle_group: glutes
    equipment: barbell
    tracking_type: weight_reps
    description: Hip hinge with a loaded bar.
    instructions: Soften the knees, push the hips back, and stand tall.
```

Set `tracking_type` on every exercise. A catalog insert that omits it becomes `custom` with weight, reps, time, and distance, and the log shows all four fields.

Use `muscle` for the primary group. Do not also set `primary_muscle_group`. Secondary is optional and must differ from the primary, ignoring case. Keep both to 80 characters. Use a short lowercase name: `chest`, `back`, `shoulders`, `arms`, `legs`, `glutes`, `core`.

`equipment` is a short lowercase word such as `barbell`, `dumbbell`, `kettlebell`, `cable`, `machine`, `bodyweight`, or `none`.

`description` is one line and does not name a program or a race. `instructions` are the steps the athlete follows. Each is at most 4000 characters. `name` is 1–160 characters.

Field limits, preset tracking types, and the heart-rate case are in [reference.md](reference.md).

## Names already in the catalog

Shared names are unique. Reusing one updates that row for every workout that points at it.

Before choosing a name, search `create_beginner_5k.py`, `create_beginner_10k.py`, and `scripts/catalog/content`. These names already exist and stay as they are unless the user asks to change them:

- `Easy Run`, `Long Run`, `Tempo Run`, `Interval Run`
- Bodyweight Squat, Reverse Lunge, Glute Bridge, Calf Raise, Step-Up, Single-Leg Romanian Deadlift, Dead Bug, Bird Dog, Heel Tap, Wall Sit, Front Plank, Side Plank

A new prescription for one of those movements gets a different name.

## Check

From `Projects/ironcrew`:

```bash
npm run catalog -- validate scripts/catalog/content/<topic>.yaml
```

Fix the reported lines and run it again. Apply only when the user asks to write the database:

```bash
DATABASE_URL='postgresql://...' npm run catalog -- apply scripts/catalog/content/<topic>.yaml
```

Apply updates a shared exercise with the same name. Tell the user the validate result and that the database was left unchanged until they ask to apply it.
