import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/upper-body-core.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);

test("upper body and core workouts use only seeded gym exercises", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 0);
  assert.deepEqual(
    document.workouts.map((workout) => workout.name),
    ["Beginner Upper Body and Core", "Intermediate Upper Body and Core", "Advanced Upper Body and Core"],
  );

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  const beginner = requiredWorkout(byName, "Beginner Upper Body and Core");
  const intermediate = requiredWorkout(byName, "Intermediate Upper Body and Core");
  const advanced = requiredWorkout(byName, "Advanced Upper Body and Core");

  assert.deepEqual(exerciseNames(beginner), [
    "Dumbbell Bench Press",
    "Rows",
    "Seated Dumbbell Press",
    "Lat Pulldown",
    "Dumbbell Curl",
    "Cable Pushdown",
    "Plank",
    "Bird Dog",
    "Crunch",
  ]);
  assert.deepEqual(exerciseNames(intermediate), [
    "Bench Press",
    "Bent-Over Row",
    "Overhead Press",
    "Lat Pulldown",
    "Dumbbell Curl",
    "Cable Pushdown",
    "Plank",
    "Russian Twist",
    "Reverse Crunch",
  ]);
  assert.deepEqual(exerciseNames(advanced), [
    "Bench Press",
    "Pull-Up",
    "Incline Bench Press",
    "Bent-Over Row",
    "Arnold Press",
    "Skull Crusher / Lying Triceps Extension",
    "Hanging Leg Raise",
    "Plank",
    "Bicycle Crunch",
  ]);

  for (const workout of document.workouts) {
    const names = exerciseNames(workout);
    assert.equal(new Set(names).size, names.length, `${workout.name} repeats an exercise`);
    assert.equal(workout.blocks[0]?.blockType, "warmup");
    assert.equal(workout.blocks.at(-1)?.blockType, "cooldown");
    const plank = workout.blocks.find((block) => block.exercise === "Plank");
    assert.ok(plank, `${workout.name} includes a plank`);
    assert.equal(plank.repsMin, null);
    assert.equal(plank.repsMax, null);
    assert.ok((plank.durationSeconds ?? 0) > 0);
    for (const name of names) {
      assert.equal(seeded.has(name), true, `${name} is not in seed_gym_exercises.py`);
    }
  }

  assert.equal(beginner.minutes, 40);
  assert.equal(intermediate.minutes, 55);
  assert.equal(advanced.minutes, 70);
  assert.match(beginner.description ?? "", /Equipment: a pair of dumbbells, a bench, and a cable station/);
  assert.match(beginner.description ?? "", /Bent-Over Row instead of Rows/);
  assert.match(beginner.description ?? "", /Pull-Up instead of Lat Pulldown/);
  assert.match(beginner.description ?? "", /Diamond Push-Up instead of Cable Pushdown/);
  assert.match(beginner.description ?? "", /Push-Up instead of Dumbbell Bench Press/);
  assert.match(beginner.description ?? "", /Crunch instead of Plank/);
  assert.match(intermediate.description ?? "", /Equipment: a barbell, a bench, a pair of dumbbells, and a cable station/);
  assert.match(intermediate.description ?? "", /Push-Up instead of Bench Press/);
  assert.match(intermediate.description ?? "", /Pull-Up instead of Lat Pulldown/);
  assert.match(intermediate.description ?? "", /Barbell Curl instead of Dumbbell Curl/);
  assert.match(advanced.description ?? "", /pull-up bar/);
  assert.match(advanced.description ?? "", /Lat Pulldown instead of Pull-Up/);
  assert.match(advanced.description ?? "", /Reverse Crunch instead of Hanging Leg Raise/);
  assert.match(advanced.description ?? "", /Dumbbell Bench Press instead of Incline Bench Press/);
  assert.match(advanced.description ?? "", /Cable Pushdown instead of Skull Crusher/);
  assert.ok(prescribedSets(beginner) < prescribedSets(intermediate));
  assert.ok(prescribedSets(intermediate) < prescribedSets(advanced));
});

function requiredWorkout(workouts: Map<string, CatalogWorkout>, name: string) {
  const workout = workouts.get(name);
  assert.ok(workout, `missing ${name}`);
  return workout;
}

function exerciseNames(workout: CatalogWorkout) {
  return workout.blocks.flatMap((block) => (block.exercise ? [block.exercise] : []));
}

function prescribedSets(workout: CatalogWorkout) {
  return workout.blocks.reduce((total, block) => total + (block.sets ?? 0), 0);
}

function seededExerciseNames(source: string) {
  return new Set([...source.matchAll(/Exercise\("([^"]+)"/g)].map((match) => match[1]));
}
