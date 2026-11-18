import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog } from "./document";

const catalogPath = new URL("../../catalog/upper-body.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);

test("the upper body workout uses only seeded gym exercises", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));
  const workout = document.workouts[0];

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 0);
  assert.equal(document.workouts.length, 1);
  assert.equal(workout?.name, "Upper Body");
  assert.equal(workout?.minutes, 55);

  const exercises = workout?.blocks.flatMap((block) => (block.exercise ? [block.exercise] : [])) ?? [];
  assert.deepEqual(exercises, [
    "Bench Press",
    "Bent-Over Row",
    "Overhead Press",
    "Lat Pulldown",
    "Standing Lateral Raise",
    "Dumbbell Curl",
    "Cable Pushdown",
  ]);
  assert.equal(new Set(exercises).size, exercises.length);
  for (const name of exercises) {
    assert.equal(seeded.has(name), true, `${name} is not in seed_gym_exercises.py`);
  }
  assert.deepEqual(
    workout?.blocks.map((block) => block.blockType),
    ["warmup", "exercise", "exercise", "exercise", "exercise", "exercise", "exercise", "exercise", "cooldown"],
  );
});

function seededExerciseNames(source: string) {
  return new Set([...source.matchAll(/Exercise\("([^"]+)"/g)].map((match) => match[1]));
}
