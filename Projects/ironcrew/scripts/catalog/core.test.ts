import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/core.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);

test("core workouts use only seeded gym exercises", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 0);
  assert.deepEqual(
    document.workouts.map((workout) => workout.name),
    ["Beginner Core", "Intermediate Core", "Advanced Core"],
  );

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  const beginner = requiredWorkout(byName, "Beginner Core");
  const intermediate = requiredWorkout(byName, "Intermediate Core");
  const advanced = requiredWorkout(byName, "Advanced Core");

  assert.deepEqual(exerciseNames(beginner), [
    "Glute Bridge",
    "Bird Dog",
    "Crunch",
    "Reverse Crunch",
    "Plank",
  ]);
  assert.deepEqual(exerciseNames(intermediate), [
    "Push-Up",
    "Glute Bridge",
    "Russian Twist",
    "Bicycle Crunch",
    "Reverse Crunch",
    "Plank",
  ]);
  assert.deepEqual(exerciseNames(advanced), [
    "Hanging Leg Raise",
    "Diamond Push-Up",
    "Russian Twist",
    "Bicycle Crunch",
    "Reverse Crunch",
    "Crunch",
    "Plank",
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
  assert.equal(plankDuration(beginner), 20);
  assert.equal(plankDuration(intermediate), 30);
  assert.equal(plankDuration(advanced), 45);
  assert.match(beginner.description ?? "", /Equipment: bodyweight/);
  assert.match(beginner.description ?? "", /Bird Dog instead of Glute Bridge/);
  assert.match(beginner.description ?? "", /Crunch instead of Plank/);
  assert.match(intermediate.description ?? "", /Equipment: bodyweight and a medicine ball/);
  assert.match(intermediate.description ?? "", /Glute Bridge instead of Push-Up/);
  assert.match(intermediate.description ?? "", /Bicycle Crunch instead of Russian Twist/);
  assert.match(intermediate.description ?? "", /Crunch instead of Plank/);
  assert.match(advanced.description ?? "", /pull-up bar/);
  assert.match(advanced.description ?? "", /medicine ball/);
  assert.match(advanced.description ?? "", /Reverse Crunch instead of Hanging Leg Raise/);
  assert.match(advanced.description ?? "", /Push-Up instead of Diamond Push-Up/);
  assert.match(advanced.description ?? "", /Bicycle Crunch instead of Russian Twist/);
  assert.match(advanced.description ?? "", /Crunch instead of Plank/);
  assert.ok(prescribedSets(beginner) < prescribedSets(intermediate));
  assert.ok(prescribedSets(intermediate) < prescribedSets(advanced));
  assert.equal(prescribedSets(beginner), 12);
  assert.equal(prescribedSets(intermediate), 19);
  assert.equal(prescribedSets(advanced), 26);
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

function plankDuration(workout: CatalogWorkout) {
  const plank = workout.blocks.find((block) => block.exercise === "Plank");
  assert.ok(plank, `${workout.name} includes a plank`);
  return plank.durationSeconds;
}

function seededExerciseNames(source: string) {
  return new Set([...source.matchAll(/Exercise\("([^"]+)"/g)].map((match) => match[1]));
}
