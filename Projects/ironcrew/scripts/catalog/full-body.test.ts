import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/full-body.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);

test("full body workouts use only seeded gym exercises", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 0);
  assert.deepEqual(
    document.workouts.map((workout) => workout.name),
    ["Beginner Full Body", "Intermediate Full Body", "Advanced Full Body"],
  );

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  const beginner = requiredWorkout(byName, "Beginner Full Body");
  const intermediate = requiredWorkout(byName, "Intermediate Full Body");
  const advanced = requiredWorkout(byName, "Advanced Full Body");

  assert.deepEqual(exerciseNames(beginner), [
    "Squat",
    "Dumbbell Bench Press",
    "Rows",
    "Glute Bridge",
    "Calf Raise",
    "Plank",
  ]);
  assert.deepEqual(exerciseNames(intermediate), [
    "Squat",
    "Bench Press",
    "Bent-Over Row",
    "Romanian Deadlift",
    "Lat Pulldown",
    "Calf Raise",
    "Plank",
  ]);
  assert.deepEqual(exerciseNames(advanced), [
    "Deadlift",
    "Bench Press",
    "Pull-Up",
    "Bulgarian Split Squat",
    "Overhead Press",
    "Hip Thrust",
    "Hanging Leg Raise",
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
  assert.match(beginner.description ?? "", /Equipment: a pair of dumbbells, a bench, and a cable station/);
  assert.match(beginner.description ?? "", /Bent-Over Row instead of Rows/);
  assert.match(beginner.description ?? "", /Push-Up instead of Dumbbell Bench Press/);
  assert.match(intermediate.description ?? "", /Equipment: a barbell, a bench, a pair of dumbbells, and a cable station/);
  assert.match(intermediate.description ?? "", /Dumbbell Bench Press instead of Bench Press/);
  assert.match(intermediate.description ?? "", /Push-Up instead of Bench Press/);
  assert.match(intermediate.description ?? "", /Pull-Up instead of Lat Pulldown/);
  assert.match(intermediate.description ?? "", /Glute Bridge instead of Romanian Deadlift/);
  assert.match(advanced.description ?? "", /pull-up bar/);
  assert.match(advanced.description ?? "", /Romanian Deadlift instead of Deadlift/);
  assert.match(advanced.description ?? "", /Dumbbell Bench Press instead of Bench Press/);
  assert.match(advanced.description ?? "", /Seated Dumbbell Press instead of Overhead Press/);
  assert.match(advanced.description ?? "", /Lat Pulldown instead of Pull-Up/);
  assert.match(advanced.description ?? "", /Reverse Crunch instead of Hanging Leg Raise/);
  assert.match(advanced.description ?? "", /Glute Bridge instead of Hip Thrust/);
  assert.match(advanced.description ?? "", /Push-Up instead of Bench Press/);
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
