import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/lower-body-core.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);

test("lower body and core workouts use only seeded gym exercises", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 0);
  assert.deepEqual(
    document.workouts.map((workout) => workout.name),
    ["Beginner Lower Body and Core", "Intermediate Lower Body and Core", "Advanced Lower Body and Core"],
  );

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  const beginner = requiredWorkout(byName, "Beginner Lower Body and Core");
  const intermediate = requiredWorkout(byName, "Intermediate Lower Body and Core");
  const advanced = requiredWorkout(byName, "Advanced Lower Body and Core");

  assert.deepEqual(exerciseNames(beginner), [
    "Squat",
    "Lunge",
    "Glute Bridge",
    "Calf Raise",
    "Plank",
    "Bird Dog",
    "Crunch",
  ]);
  assert.deepEqual(exerciseNames(intermediate), [
    "Squat",
    "Romanian Deadlift",
    "Bulgarian Split Squat",
    "Hip Thrust",
    "Calf Raise",
    "Plank",
    "Reverse Crunch",
    "Russian Twist",
  ]);
  assert.deepEqual(exerciseNames(advanced), [
    "Squat",
    "Romanian Deadlift",
    "Bulgarian Split Squat",
    "Hip Thrust",
    "Calf Raise",
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
  assert.match(beginner.description ?? "", /Equipment: bodyweight/);
  assert.match(beginner.description ?? "", /Glute Bridge instead of Lunge/);
  assert.match(beginner.description ?? "", /Crunch instead of Plank/);
  assert.match(intermediate.description ?? "", /Equipment: a barbell, a bench, and a pair of dumbbells/);
  assert.match(intermediate.description ?? "", /Glute Bridge instead of Hip Thrust/);
  assert.match(intermediate.description ?? "", /Lunge instead of Bulgarian Split Squat/);
  assert.match(intermediate.description ?? "", /Glute Bridge instead of Romanian Deadlift/);
  assert.match(advanced.description ?? "", /pull-up bar/);
  assert.match(advanced.description ?? "", /Reverse Crunch instead of Hanging Leg Raise/);
  assert.match(advanced.description ?? "", /Glute Bridge instead of Hip Thrust/);
  assert.match(advanced.description ?? "", /Lunge instead of Bulgarian Split Squat/);
  assert.match(advanced.description ?? "", /Glute Bridge instead of Romanian Deadlift/);
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
