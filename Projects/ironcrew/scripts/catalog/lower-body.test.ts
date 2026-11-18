import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/lower-body.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);

test("lower body workouts use only seeded gym exercises", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 0);
  assert.deepEqual(
    document.workouts.map((workout) => workout.name),
    ["Beginner Lower Body", "Intermediate Lower Body", "Advanced Lower Body"],
  );

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  const beginner = requiredWorkout(byName, "Beginner Lower Body");
  const intermediate = requiredWorkout(byName, "Intermediate Lower Body");
  const advanced = requiredWorkout(byName, "Advanced Lower Body");

  assert.deepEqual(exerciseNames(beginner), [
    "Squat",
    "Romanian Deadlift",
    "Lunge",
    "Bulgarian Split Squat",
    "Calf Raise",
  ]);
  assert.deepEqual(exerciseNames(intermediate), [
    "Squat",
    "Romanian Deadlift",
    "Hip Thrust",
    "Bulgarian Split Squat",
    "Lunge",
    "Calf Raise",
  ]);
  assert.deepEqual(exerciseNames(advanced), [
    "Squat",
    "Romanian Deadlift",
    "Hip Thrust",
    "Bulgarian Split Squat",
    "Lunge",
    "Calf Raise",
  ]);

  for (const workout of document.workouts) {
    const names = exerciseNames(workout);
    assert.equal(new Set(names).size, names.length, `${workout.name} repeats an exercise`);
    assert.equal(workout.blocks[0]?.blockType, "warmup");
    assert.equal(workout.blocks.at(-1)?.blockType, "cooldown");
    for (const name of names) {
      assert.equal(seeded.has(name), true, `${name} is not in seed_gym_exercises.py`);
    }
  }

  assert.equal(beginner.minutes, 40);
  assert.equal(intermediate.minutes, 55);
  assert.equal(advanced.minutes, 70);
  assert.match(beginner.description ?? "", /Equipment: a pair of dumbbells and a bench/);
  assert.match(beginner.description ?? "", /Glute Bridge instead of Romanian Deadlift/);
  assert.match(beginner.description ?? "", /Lunge instead of Bulgarian Split Squat/);
  assert.match(intermediate.description ?? "", /Equipment: a barbell, a bench, and a pair of dumbbells/);
  assert.match(intermediate.description ?? "", /Glute Bridge instead of Hip Thrust/);
  assert.match(intermediate.description ?? "", /Lunge instead of Bulgarian Split Squat/);
  assert.match(advanced.description ?? "", /Equipment: a barbell, a bench, and a pair of dumbbells/);
  assert.match(advanced.description ?? "", /Glute Bridge instead of Hip Thrust/);
  assert.match(advanced.description ?? "", /Lunge instead of Bulgarian Split Squat/);
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
