import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCatalog, type CatalogWorkout } from "./document";

const catalogPath = new URL("../../catalog/general-fitness.yaml", import.meta.url);
const seedPath = new URL("../../devshell/seed_gym_exercises.py", import.meta.url);

const UPPER_PRESS = [
  "Bench Press",
  "Bent-Over Row",
  "Seated Dumbbell Press",
  "Standing Lateral Raise",
  "Dumbbell Curl",
  "Cable Pushdown",
];

const UPPER_PULL = [
  "Overhead Press",
  "Lat Pulldown",
  "Incline Bench Press",
  "Bent-Over Rear Delt Fly",
  "Hammer Curl",
  "Overhead Dumbbell Extension",
];

const LOWER_SQUAT = ["Squat", "Romanian Deadlift", "Lunge", "Calf Raise"];

const LOWER_HINGE = ["Hip Thrust", "Bulgarian Split Squat", "Glute Bridge", "Calf Raise"];

const STRENGTH_HINGE = ["Deadlift", "Hip Thrust", "Bulgarian Split Squat", "Calf Raise"];

const RUNS = new Set([
  "Easy Run 35 min",
  "Easy Run 40 min",
  "Tempo Run 25 min",
  "Easy Run 30 min",
  "6 x 1 min Speed Bursts",
  "Easy Run 15 min",
  "5 km Time Trial",
]);

test("16 week general fitness program uses seeded exercises and reused sessions", () => {
  const document = readCatalog(catalogPath.pathname);
  const seeded = seededExerciseNames(readFileSync(seedPath, "utf8"));

  assert.equal(document.exercises.length, 0);
  assert.equal(document.programs.length, 1);

  const byName = new Map(document.workouts.map((workout) => [workout.name, workout]));
  for (const workout of document.workouts) {
    assert.doesNotMatch(workout.name, /week/i, `${workout.name} is tied to a week`);
    const names = exerciseNames(workout);
    assert.equal(new Set(names).size, names.length, `${workout.name} repeats an exercise`);
    assert.equal(workout.blocks[0]?.blockType, "warmup");
    assert.equal(workout.blocks.at(-1)?.blockType, "cooldown");
    for (const name of names) {
      assert.equal(seeded.has(name), true, `${name} is not in seed_gym_exercises.py`);
    }
    const text = `${workout.name} ${workout.description ?? ""} ${workout.blocks.map((block) => block.instructions ?? "").join(" ")}`;
    assert.doesNotMatch(text, /\bmiles?\b/i, `${workout.name} still uses miles`);
    if (RUNS.has(workout.name)) {
      assert.match(workout.description ?? "", /Equipment: running shoes and a road, track, or path/);
      for (const name of names) {
        assert.match(workout.description ?? "", new RegExp(`use Treadmill instead of ${name}`));
      }
    } else {
      assert.match(workout.description ?? "", /Equipment:/);
    }
  }

  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Foundation Upper Press")), UPPER_PRESS);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Volume Upper Press")), UPPER_PRESS);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Deload Upper Press")), UPPER_PRESS);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Strength Upper Press")), UPPER_PRESS);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Peak Upper Press")), UPPER_PRESS);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Taper Upper Press")), UPPER_PRESS);

  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Foundation Upper Pull")), UPPER_PULL);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Deload Upper Pull")), exerciseNames(requiredWorkout(byName, "Volume Upper Pull")));
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Volume Upper Pull")), UPPER_PULL);

  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Deload Lower Squat")), exerciseNames(requiredWorkout(byName, "Volume Lower Squat")));
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Volume Lower Squat")), LOWER_SQUAT);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Taper Lower Squat")), LOWER_SQUAT);

  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Deload Lower Hinge")), exerciseNames(requiredWorkout(byName, "Volume Lower Hinge")));
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Volume Lower Hinge")), LOWER_HINGE);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Strength Lower Hinge")), STRENGTH_HINGE);
  assert.deepEqual(exerciseNames(requiredWorkout(byName, "Peak Lower Hinge")), STRENGTH_HINGE);

  assert.equal(sets(byName, "Foundation Upper Press", "Bench Press"), 3);
  assert.deepEqual(reps(byName, "Foundation Upper Press", "Bench Press"), [12, 15]);
  assert.equal(rest(byName, "Foundation Upper Press", "Bench Press"), 75);
  assert.equal(rest(byName, "Foundation Upper Press", "Cable Pushdown"), 60);
  assert.equal(sets(byName, "Foundation Lower Hinge", "Hip Thrust"), 3);
  assert.equal(rest(byName, "Foundation Lower Hinge", "Calf Raise"), 60);

  assert.equal(sets(byName, "Volume Upper Press", "Bench Press"), 4);
  assert.equal(sets(byName, "Volume Upper Press", "Standing Lateral Raise"), 3);
  assert.deepEqual(reps(byName, "Volume Upper Press", "Bench Press"), [8, 12]);
  assert.equal(rest(byName, "Volume Lower Squat", "Squat"), 90);
  assert.equal(sets(byName, "Volume Lower Hinge", "Hip Thrust"), 4);
  assert.equal(sets(byName, "Volume Lower Hinge", "Glute Bridge"), 3);
  assert.match(requiredWorkout(byName, "Volume Upper Press").description ?? "", /8-12/);

  assert.equal(sets(byName, "Deload Upper Press", "Bench Press"), 2);
  assert.equal(sets(byName, "Deload Upper Press", "Standing Lateral Raise"), 2);
  assert.equal(sets(byName, "Deload Lower Hinge", "Hip Thrust"), 2);
  assert.equal(sets(byName, "Deload Lower Hinge", "Calf Raise"), 2);
  assert.match(instructions(byName, "Deload Upper Press"), /10-15% less weight/);
  assert.match(instructions(byName, "Deload Lower Hinge"), /10-15% less weight/);

  assert.equal(sets(byName, "Strength Upper Press", "Bench Press"), 4);
  assert.deepEqual(reps(byName, "Strength Upper Press", "Bench Press"), [5, 8]);
  assert.equal(rest(byName, "Strength Upper Press", "Bench Press"), 180);
  assert.equal(rest(byName, "Strength Upper Press", "Bent-Over Row"), 180);
  assert.equal(sets(byName, "Strength Upper Press", "Seated Dumbbell Press"), 3);
  assert.deepEqual(reps(byName, "Strength Upper Press", "Seated Dumbbell Press"), [6, 8]);
  assert.equal(rest(byName, "Strength Upper Press", "Seated Dumbbell Press"), 120);
  assert.equal(sets(byName, "Strength Upper Press", "Standing Lateral Raise"), 3);
  assert.deepEqual(reps(byName, "Strength Upper Press", "Dumbbell Curl"), [10, 12]);
  assert.equal(rest(byName, "Strength Upper Press", "Cable Pushdown"), 60);
  assert.equal(sets(byName, "Strength Lower Squat", "Squat"), 4);
  assert.equal(rest(byName, "Strength Lower Squat", "Squat"), 180);
  assert.equal(sets(byName, "Strength Lower Hinge", "Deadlift"), 4);
  assert.equal(rest(byName, "Strength Lower Hinge", "Deadlift"), 180);
  assert.equal(rest(byName, "Strength Upper Pull", "Overhead Press"), 180);
  assert.equal(rest(byName, "Strength Upper Pull", "Lat Pulldown"), 180);

  assert.equal(sets(byName, "Peak Upper Press", "Bench Press"), 4);
  assert.deepEqual(reps(byName, "Peak Upper Press", "Bench Press"), [6, 8]);
  assert.equal(rest(byName, "Peak Upper Press", "Bench Press"), 150);
  assert.equal(rpe(byName, "Peak Upper Press", "Bench Press"), 9);
  assert.equal(rpe(byName, "Peak Upper Press", "Seated Dumbbell Press"), 8.5);
  assert.equal(rpe(byName, "Peak Lower Hinge", "Deadlift"), 9);
  assert.equal(sets(byName, "Peak Lower Squat", "Lunge"), 3);
  assert.equal(rpe(byName, "Peak Lower Squat", "Lunge"), 8.5);
  assert.equal(sets(byName, "Peak Upper Press", "Dumbbell Curl"), 3);
  assert.deepEqual(reps(byName, "Peak Upper Press", "Dumbbell Curl"), [10, 12]);

  assert.equal(sets(byName, "Taper Upper Press", "Bench Press"), 2);
  assert.equal(rpe(byName, "Taper Upper Press", "Bench Press"), 7);
  assert.equal(sets(byName, "Taper Lower Squat", "Squat"), 2);
  assert.equal(rpe(byName, "Taper Lower Squat", "Calf Raise"), 7);

  assert.equal(sets(byName, "Strength Benchmarks", "Bench Press"), 3);
  assert.deepEqual(reps(byName, "Strength Benchmarks", "Squat"), [5, 5]);
  assert.equal(rest(byName, "Strength Benchmarks", "Deadlift"), 180);
  assert.equal(rpe(byName, "Strength Benchmarks", "Deadlift"), 9);
  assert.equal(sets(byName, "Strength Benchmarks", "Push-Up"), 1);
  assert.match(blockFor(byName, "Strength Benchmarks", "Push-Up").instructions ?? "", /Stop when form breaks/);

  assert.equal(duration(byName, "Easy Run 35 min", "Easy Run"), 2100);
  assert.equal(duration(byName, "Easy Run 40 min", "Easy Run"), 2400);
  assert.equal(duration(byName, "Tempo Run 25 min", "Steady Interval"), 1500);
  assert.equal(rpe(byName, "Tempo Run 25 min", "Steady Interval"), 7);
  assert.equal(duration(byName, "Easy Run 30 min", "Easy Run"), 1800);
  assert.equal(sets(byName, "6 x 1 min Speed Bursts", "Speed Burst"), 6);
  assert.equal(duration(byName, "6 x 1 min Speed Bursts", "Speed Burst"), 60);
  assert.equal(rest(byName, "6 x 1 min Speed Bursts", "Speed Burst"), 120);
  assert.equal(duration(byName, "Easy Run 15 min", "Easy Run"), 900);
  assert.equal(distance(byName, "5 km Time Trial", "Race Pace"), 5000);

  const program = document.programs[0];
  assert.equal(program?.name, "16 Week General Fitness");
  assert.equal(program?.status, "active");
  assert.equal(program?.estimatedDurationWeeks, 16);
  assert.match(program?.description ?? "", /strength/);
  assert.match(program?.description ?? "", /endurance/);
  assert.match(program?.description ?? "", /conditioning/);
  assert.doesNotMatch(`${program?.name ?? ""} ${program?.description ?? ""}`, /\bmiles?\b/i);
  assert.deepEqual(
    program?.phases.map((phase) => phase.name),
    [
      "Anatomical Adaptation and Foundation",
      "Muscle Building and Volume Accumulation",
      "Mid-Point Deload",
      "Strength and Force Production",
      "Conditioning Peak and Final Taper",
    ],
  );
  assert.match(program?.phases[0]?.description ?? "", /3 sets of 12-15/);
  assert.match(program?.phases[0]?.description ?? "", /Zone 2/);
  assert.match(program?.phases[1]?.description ?? "", /8-12/);
  assert.match(program?.phases[2]?.description ?? "", /10-15%/);
  assert.match(program?.phases[3]?.description ?? "", /5-8/);
  assert.match(program?.phases[4]?.description ?? "", /push-up max/);
  assert.match(program?.phases[4]?.description ?? "", /5 km/);

  const weeks = program?.phases.flatMap((phase) => phase.weeks) ?? [];
  assert.deepEqual(
    program?.phases.map((phase) => phase.weeks.length),
    [4, 4, 1, 4, 3],
  );
  assert.deepEqual(
    weeks.map((week) => week.weekNumber),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  );

  for (const [index, week] of weeks.entries()) {
    const expectedDays = index === 15 ? "1,2,3,5,7" : "1,2,3,5,6,7";
    assert.equal(week.days.map((day) => day.day).join(","), expectedDays);
    assert.deepEqual(
      week.days.map((day) => day.workoutName),
      WEEK_WORKOUTS[index],
    );
    for (const day of week.days) {
      assert.ok(byName.has(day.workoutName ?? ""), `${day.workoutName} is not defined in this file`);
    }
  }
});

const WEEK_WORKOUTS = [
  ["Foundation Upper Press", "Foundation Lower Squat", "Easy Run 35 min", "Foundation Upper Pull", "Foundation Lower Hinge", "Easy Run 35 min"],
  ["Foundation Upper Press", "Foundation Lower Squat", "Easy Run 35 min", "Foundation Upper Pull", "Foundation Lower Hinge", "Easy Run 35 min"],
  ["Foundation Upper Press", "Foundation Lower Squat", "Easy Run 35 min", "Foundation Upper Pull", "Foundation Lower Hinge", "Easy Run 35 min"],
  ["Foundation Upper Press", "Foundation Lower Squat", "Easy Run 35 min", "Foundation Upper Pull", "Foundation Lower Hinge", "Easy Run 35 min"],
  ["Volume Upper Press", "Volume Lower Squat", "Easy Run 40 min", "Volume Upper Pull", "Volume Lower Hinge", "Tempo Run 25 min"],
  ["Volume Upper Press", "Volume Lower Squat", "Easy Run 40 min", "Volume Upper Pull", "Volume Lower Hinge", "Tempo Run 25 min"],
  ["Volume Upper Press", "Volume Lower Squat", "Easy Run 40 min", "Volume Upper Pull", "Volume Lower Hinge", "Tempo Run 25 min"],
  ["Volume Upper Press", "Volume Lower Squat", "Easy Run 40 min", "Volume Upper Pull", "Volume Lower Hinge", "Tempo Run 25 min"],
  ["Deload Upper Press", "Deload Lower Squat", "Easy Run 40 min", "Deload Upper Pull", "Deload Lower Hinge", "Tempo Run 25 min"],
  ["Strength Upper Press", "Strength Lower Squat", "Easy Run 30 min", "Strength Upper Pull", "Strength Lower Hinge", "6 x 1 min Speed Bursts"],
  ["Strength Upper Press", "Strength Lower Squat", "Easy Run 30 min", "Strength Upper Pull", "Strength Lower Hinge", "6 x 1 min Speed Bursts"],
  ["Strength Upper Press", "Strength Lower Squat", "Easy Run 30 min", "Strength Upper Pull", "Strength Lower Hinge", "6 x 1 min Speed Bursts"],
  ["Strength Upper Press", "Strength Lower Squat", "Easy Run 30 min", "Strength Upper Pull", "Strength Lower Hinge", "6 x 1 min Speed Bursts"],
  ["Peak Upper Press", "Peak Lower Squat", "Easy Run 30 min", "Peak Upper Pull", "Peak Lower Hinge", "6 x 1 min Speed Bursts"],
  ["Peak Upper Press", "Peak Lower Squat", "Easy Run 30 min", "Peak Upper Pull", "Peak Lower Hinge", "6 x 1 min Speed Bursts"],
  ["Taper Upper Press", "Taper Lower Squat", "Easy Run 15 min", "Strength Benchmarks", "5 km Time Trial"],
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

function reps(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  const block = blockFor(workouts, workoutName, exercise);
  return [block.repsMin, block.repsMax];
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

function rpe(workouts: Map<string, CatalogWorkout>, workoutName: string, exercise: string) {
  return blockFor(workouts, workoutName, exercise).rpeTarget;
}

function instructions(workouts: Map<string, CatalogWorkout>, workoutName: string) {
  const workout = requiredWorkout(workouts, workoutName);
  return [workout.description ?? "", ...workout.blocks.map((block) => block.instructions ?? "")].join(" ");
}

function seededExerciseNames(source: string) {
  return new Set([...source.matchAll(/Exercise\("([^"]+)"/g)].map((match) => match[1]));
}
