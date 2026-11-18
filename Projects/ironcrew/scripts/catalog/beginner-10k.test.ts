import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/beginner-10k.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);
const lowerBodyPath = new URL("../../catalog/lower-body.yaml", import.meta.url);
const lowerBodyCorePath = new URL("../../catalog/lower-body-core.yaml", import.meta.url);

const LOWER_BODY = "Beginner Lower Body";
const LOWER_BODY_CORE = "Beginner Lower Body and Core";

test("beginner 10K program uses seeded runs and existing strength workouts", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));
  const strengthNames = new Set([
    ...readCatalog(lowerBodyPath.pathname).workouts.map((workout) => workout.name),
    ...readCatalog(lowerBodyCorePath.pathname).workouts.map((workout) => workout.name),
  ]);

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 1);
  assert.equal(strengthNames.has(LOWER_BODY), true);
  assert.equal(strengthNames.has(LOWER_BODY_CORE), true);

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  for (const workout of document.workouts) {
    assert.doesNotMatch(workout.name, /week/i, `${workout.name} is tied to a week`);
    assert.doesNotMatch(workout.name, /^10K Week/, `${workout.name} is tied to the plan`);
    const names = exerciseNames(workout);
    assert.equal(new Set(names).size, names.length, `${workout.name} repeats an exercise`);
    assert.equal(workout.blocks[0]?.blockType, "warmup");
    assert.equal(workout.blocks.at(-1)?.blockType, "cooldown");
    assert.match(workout.description ?? "", /Equipment: running shoes and a road, track, or path/);
    for (const name of names) {
      assert.equal(seeded.has(name), true, `${name} is not in seed_gym_exercises.py`);
      assert.match(workout.description ?? "", new RegExp(`use Treadmill instead of ${name}`));
    }
  }

  assert.equal(distance(byName, "Easy Run 6.5 km", "Easy Run"), 6500);
  assert.equal(distance(byName, "Easy Run 8 km", "Easy Run"), 8000);
  assert.equal(distance(byName, "Easy Run 9.5 km", "Easy Run"), 9500);
  assert.equal(distance(byName, "10 km Race", "Race Pace"), 10000);
  assert.ok(distance(byName, "Easy Run 3 km", "Easy Run") < distance(byName, "Easy Run 5 km", "Easy Run"));
  for (const workout of document.workouts) {
    const text = `${workout.name} ${workout.description ?? ""} ${workout.blocks.map((block) => block.instructions ?? "").join(" ")}`;
    assert.doesNotMatch(text, /\bmiles?\b/i, `${workout.name} still uses miles`);
  }

  const program = document.programs[0];
  assert.equal(program?.name, "8 Week 10K Beginner Running");
  assert.equal(program?.status, "active");
  assert.equal(program?.estimatedDurationWeeks, 8);
  assert.match(program?.name ?? "", /10K/);
  assert.match(program?.description ?? "", /10 km/);
  assert.match(program?.description ?? "", /run/);
  assert.deepEqual(
    program?.phases.map((phase) => phase.name),
    ["Base Building & Adaptation", "Endurance & Strength Building", "Peak & Taper"],
  );
  assert.match(program?.phases[0]?.description ?? "", /6\.5 km long run/);
  assert.match(program?.phases[1]?.description ?? "", /8 km long run/);
  assert.match(program?.phases[2]?.description ?? "", /10 km on day 7 of week 8/);

  const weeks = program?.phases.flatMap((phase) => phase.weeks) ?? [];
  assert.deepEqual(
    program?.phases.map((phase) => phase.weeks.length),
    [3, 3, 2],
  );
  assert.deepEqual(
    weeks.map((week) => week.weekNumber),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );

  for (const [index, week] of weeks.entries()) {
    assert.equal(week.days.map((day) => day.day).join(","), "1,2,3,5,7");
    assert.equal(week.days[1]?.workoutName, LOWER_BODY_CORE);
    assert.equal(week.days[3]?.workoutName, LOWER_BODY);
    assert.equal(week.days[0]?.workoutName, EASY[index]);
    assert.equal(week.days[2]?.workoutName, QUALITY[index]);
    assert.equal(week.days[4]?.workoutName, LONG[index]);
    for (const day of week.days) {
      if (day.workoutName === LOWER_BODY || day.workoutName === LOWER_BODY_CORE) continue;
      assert.ok(byName.has(day.workoutName ?? ""), `${day.workoutName} is not defined in this file`);
    }
  }

  assert.equal(sets(byName, "4 x 400m Speed Bursts", "Speed Burst"), 4);
  assert.equal(sets(byName, "5 x 400m Speed Bursts", "Speed Burst"), 5);
  assert.equal(sets(byName, "3 x 400m Speed Bursts", "Speed Burst"), 3);
  assert.equal(distance(byName, "3 x 1 km Steady Intervals", "Steady Interval"), 1000);
  assert.equal(sets(byName, "3 x 1 km Steady Intervals", "Steady Interval"), 3);
  assert.equal(sets(byName, "4 x 1 km Steady Intervals", "Steady Interval"), 4);
  assert.equal(sets(byName, "2 x 1 km Race Pace", "Race Pace"), 2);
  assert.equal(sets(byName, "6 x 100m Strides", "Stride"), 6);
  assert.equal(distance(byName, "6 x 100m Strides", "Stride"), 100);
});

const EASY = [
  "Easy Run 3 km",
  "Easy Run 4 km",
  "Easy Run 5 km",
  "Easy Run 3 km",
  "Easy Run 5 km",
  "Easy Run 5 km",
  "Easy Run 4 km",
  "Easy Run 3 km",
];

const QUALITY = [
  "4 x 400m Speed Bursts",
  "4 x 400m Speed Bursts",
  "5 x 400m Speed Bursts",
  "3 x 400m Speed Bursts",
  "3 x 1 km Steady Intervals",
  "4 x 1 km Steady Intervals",
  "2 x 1 km Race Pace",
  "6 x 100m Strides",
];

const LONG = [
  "Easy Run 4 km",
  "Easy Run 5.5 km",
  "Easy Run 6.5 km",
  "Easy Run 5 km",
  "Easy Run 7 km",
  "Easy Run 8 km",
  "Easy Run 9.5 km",
  "10 km Race",
];

function requiredWorkout(workouts: Map<string, CatalogWorkout>, name: string) {
  const workout = workouts.get(name);
  assert.ok(workout, `missing ${name}`);
  return workout;
}

function exerciseNames(workout: CatalogWorkout) {
  return workout.blocks.flatMap((block) => (block.exercise ? [block.exercise] : []));
}

function distance(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  const block = requiredWorkout(workouts, workoutName).blocks.find((item) => item.exercise === exercise);
  assert.ok(block, `${workoutName} missing ${exercise}`);
  assert.equal(typeof block.distanceMeters, "number", `${workoutName} ${exercise} needs a distance`);
  return block.distanceMeters ?? 0;
}

function sets(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  const block = requiredWorkout(workouts, workoutName).blocks.find((item) => item.exercise === exercise);
  assert.ok(block, `${workoutName} missing ${exercise}`);
  return block.sets;
}

function seededExerciseNames(source: string) {
  return new Set([...source.matchAll(/Exercise\("([^"]+)"/g)].map((match) => match[1]));
}
