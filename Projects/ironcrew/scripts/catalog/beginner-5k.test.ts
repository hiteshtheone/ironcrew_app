import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/beginner-5k.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);
const lowerBodyCorePath = new URL("../../catalog/lower-body-core.yaml", import.meta.url);

const LOWER_BODY_CORE = "Beginner Lower Body and Core";

test("beginner 5K program uses seeded runs and the existing lower-body-and-core workout", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));
  const strengthNames = new Set(readCatalog(lowerBodyCorePath.pathname).workouts.map((workout) => workout.name));

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 1);
  assert.equal(strengthNames.has(LOWER_BODY_CORE), true);

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  for (const workout of document.workouts) {
    assert.doesNotMatch(workout.name, /week/i, `${workout.name} is tied to a week`);
    assert.doesNotMatch(workout.name, /^5K Week/, `${workout.name} is tied to the plan`);
    const names = exerciseNames(workout);
    assert.equal(new Set(names).size, names.length, `${workout.name} repeats an exercise`);
    assert.equal(workout.blocks[0]?.blockType, "warmup");
    assert.equal(workout.blocks.at(-1)?.blockType, "cooldown");
    assert.match(workout.description ?? "", /Equipment: running shoes and a road, track, or path/);
    for (const name of names) {
      assert.equal(seeded.has(name), true, `${name} is not in seed_gym_exercises.py`);
      assert.match(workout.description ?? "", new RegExp(`use Treadmill instead of ${name}`));
    }
    const text = `${workout.name} ${workout.description ?? ""} ${workout.blocks.map((block) => block.instructions ?? "").join(" ")}`;
    assert.doesNotMatch(text, /\bmiles?\b/i, `${workout.name} still uses miles`);
  }

  assert.equal(duration(byName, "8 x 1 min Easy Run", "Easy Run"), 60);
  assert.equal(sets(byName, "8 x 1 min Easy Run", "Easy Run"), 8);
  assert.equal(rest(byName, "8 x 1 min Easy Run", "Easy Run"), 90);
  assert.equal(duration(byName, "6 x 90s Easy Run", "Easy Run"), 90);
  assert.equal(sets(byName, "6 x 90s Easy Run", "Easy Run"), 6);
  assert.equal(rest(byName, "6 x 90s Easy Run", "Easy Run"), 120);
  assert.equal(duration(byName, "90s and 3 min Easy Run", "Easy Run"), 1080);
  assert.match(instructions(byName, "90s and 3 min Easy Run", "Easy Run"), /Jog 90 seconds, walk 90 seconds, jog 3 minutes, walk 3 minutes/);
  assert.equal(duration(byName, "3 and 5 min Easy Run", "Easy Run"), 1290);
  assert.match(instructions(byName, "3 and 5 min Easy Run", "Easy Run"), /walk 2\.5 minutes/);
  assert.equal(duration(byName, "3 x 5 min Easy Run", "Easy Run"), 300);
  assert.equal(sets(byName, "3 x 5 min Easy Run", "Easy Run"), 3);
  assert.equal(rest(byName, "3 x 5 min Easy Run", "Easy Run"), 180);
  assert.equal(duration(byName, "2 x 8 min Easy Run", "Easy Run"), 480);
  assert.equal(rest(byName, "2 x 8 min Easy Run", "Easy Run"), 300);
  assert.equal(duration(byName, "Easy Run 20 min", "Easy Run"), 1200);
  assert.equal(duration(byName, "5 and 8 min Easy Run", "Easy Run"), 1440);
  assert.equal(duration(byName, "2 x 10 min Easy Run", "Easy Run"), 600);
  assert.equal(rest(byName, "2 x 10 min Easy Run", "Easy Run"), 180);
  assert.equal(duration(byName, "Easy Run 25 min", "Easy Run"), 1500);
  assert.equal(duration(byName, "Easy Run 28 min", "Easy Run"), 1680);
  assert.equal(distance(byName, "5 km Race", "Race Pace"), 5000);

  const program = document.programs[0];
  assert.equal(program?.name, "8 Week 5K Beginner Running");
  assert.equal(program?.status, "active");
  assert.equal(program?.estimatedDurationWeeks, 8);
  assert.match(program?.name ?? "", /5K/);
  assert.match(program?.description ?? "", /5 km/);
  assert.match(program?.description ?? "", /run/);
  assert.match(program?.description ?? "", /endurance/);
  assert.match(program?.description ?? "", /Beginner Lower Body and Core/);
  assert.doesNotMatch(`${program?.name ?? ""} ${program?.description ?? ""}`, /\bmiles?\b/i);
  assert.deepEqual(
    program?.phases.map((phase) => phase.name),
    ["Joint Adaptation & Habit Building", "Aerobic Stamina & Interval Extension", "Continuous Endurance & Race Readiness"],
  );
  assert.match(program?.phases[0]?.description ?? "", /9 run sessions/);
  assert.match(program?.phases[1]?.description ?? "", /week 6 is continuous/);
  assert.match(program?.phases[2]?.description ?? "", /finish 5 km without stopping/);

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
    assert.equal(week.days.map((day) => day.day).join(","), "1,3,5,7");
    assert.equal(week.days[2]?.workoutName, LOWER_BODY_CORE);
    assert.equal(week.days[0]?.workoutName, DAY1[index]);
    assert.equal(week.days[1]?.workoutName, DAY3[index]);
    assert.equal(week.days[3]?.workoutName, DAY7[index]);
    assert.doesNotMatch(week.notes ?? "", /\bmiles?\b/i, `${week.name} still uses miles`);
    for (const day of week.days) {
      if (day.workoutName === LOWER_BODY_CORE) continue;
      assert.ok(byName.has(day.workoutName ?? ""), `${day.workoutName} is not defined in this file`);
    }
  }
});

const DAY1 = [
  "8 x 1 min Easy Run",
  "6 x 90s Easy Run",
  "90s and 3 min Easy Run",
  "3 and 5 min Easy Run",
  "3 x 5 min Easy Run",
  "5 and 8 min Easy Run",
  "Easy Run 25 min",
  "Easy Run 28 min",
];

const DAY3 = [
  "8 x 1 min Easy Run",
  "6 x 90s Easy Run",
  "90s and 3 min Easy Run",
  "3 and 5 min Easy Run",
  "2 x 8 min Easy Run",
  "2 x 10 min Easy Run",
  "Easy Run 25 min",
  "Easy Run 28 min",
];

const DAY7 = [
  "8 x 1 min Easy Run",
  "6 x 90s Easy Run",
  "90s and 3 min Easy Run",
  "3 and 5 min Easy Run",
  "Easy Run 20 min",
  "Easy Run 25 min",
  "Easy Run 25 min",
  "5 km Race",
];

function requiredWorkout(workouts: Map<string, CatalogWorkout>, name: string) {
  const workout = workouts.get(name);
  assert.ok(workout, `missing ${name}`);
  return workout;
}

function exerciseNames(workout: CatalogWorkout) {
  return workout.blocks.flatMap((block) => (block.exercise ? [block.exercise] : []));
}

function blockFor(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  const block = requiredWorkout(workouts, workoutName).blocks.find((item) => item.exercise === exercise);
  assert.ok(block, `${workoutName} missing ${exercise}`);
  return block;
}

function distance(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  const block = blockFor(workouts, workoutName, exercise);
  assert.equal(typeof block.distanceMeters, "number", `${workoutName} ${exercise} needs a distance`);
  return block.distanceMeters ?? 0;
}

function duration(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  const block = blockFor(workouts, workoutName, exercise);
  assert.equal(typeof block.durationSeconds, "number", `${workoutName} ${exercise} needs a duration`);
  return block.durationSeconds ?? 0;
}

function sets(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  return blockFor(workouts, workoutName, exercise).sets;
}

function rest(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  return blockFor(workouts, workoutName, exercise).restSeconds;
}

function instructions(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  return blockFor(workouts, workoutName, exercise).instructions ?? "";
}

function seededExerciseNames(source: string) {
  return new Set([...source.matchAll(/Exercise\("([^"]+)"/g)].map((match) => match[1]));
}
