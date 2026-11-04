import assert from "node:assert/strict";
import { test } from "node:test";

import { CatalogError, parseCatalog, readCatalog } from "./document";

const examplePath = new URL("./example.yaml", import.meta.url);

test("the example catalog is valid", () => {
  const document = readCatalog(examplePath.pathname);
  assert.equal(document.exercises[0]?.name, "Bench Press");
  assert.equal(document.exercises[0]?.muscle, "chest");
  assert.equal(document.workouts[0]?.minutes, 60);
  assert.deepEqual(
    { min: document.workouts[0]?.blocks[0]?.repsMin, max: document.workouts[0]?.blocks[0]?.repsMax },
    { min: 6, max: 8 },
  );
  assert.equal(document.programs[0]?.status, "active");
  assert.equal(document.programs[0]?.phases[0]?.weeks[0]?.days[0]?.day, 1);
  assert.equal(document.programs[0]?.phases[0]?.weeks[0]?.days[0]?.position, 1);
});

test("reps accept a single number or a range", () => {
  const single = parseCatalog({
    workouts: [{ name: "Push", blocks: [{ exercise: "Bench Press", reps: 8 }] }],
  });
  assert.equal(single.workouts[0]?.blocks[0]?.repsMin, 8);
  assert.equal(single.workouts[0]?.blocks[0]?.repsMax, 8);

  const range = parseCatalog({
    workouts: [{ name: "Push", blocks: [{ exercise: "Bench Press", reps: "6 - 8" }] }],
  });
  assert.equal(range.workouts[0]?.blocks[0]?.repsMin, 6);
  assert.equal(range.workouts[0]?.blocks[0]?.repsMax, 8);
});

test("a later slot on the same day gets the next position", () => {
  const document = parseCatalog({
    programs: [
      {
        name: "Push Pull",
        phases: [
          {
            name: "Base",
            weeks: [{ days: [{ day: 1, workout: "Push A" }, { day: 1, workout: "Push B" }, { day: 2, workout: "Pull", position: 3 }] }],
          },
        ],
      },
    ],
  });
  const days = document.programs[0]?.phases[0]?.weeks[0]?.days ?? [];
  assert.deepEqual(
    days.map((day) => [day.day, day.position, day.workoutName]),
    [
      [1, 1, "Push A"],
      [1, 2, "Push B"],
      [2, 3, "Pull"],
    ],
  );
});

test("invalid catalogs list every problem", () => {
  assert.throws(
    () =>
      parseCatalog({
        exercises: [{ name: "  " }, { name: "Bench Press", muscle: 1 }, { name: "Bench Press" }],
        workouts: [{ name: "Push", minutes: 0, blocks: [{ reps: "8-6", rest: -1, day: 9 }] }],
        programs: [{ name: "P", status: "live", phases: [{ name: "Base", weeks: [{ days: [{ day: 8, workout: "" }] }] }] }],
      }),
    (error: unknown) => {
      assert.ok(error instanceof CatalogError);
      const text = error.details.join("\n");
      assert.match(text, /name must be between 1 and 160/);
      assert.match(text, /muscle must be a string/);
      assert.match(text, /duplicate exercise "Bench Press"/);
      assert.match(text, /minutes must be an integer of 1 or greater/);
      assert.match(text, /reps max must be greater than or equal to reps min/);
      assert.match(text, /rest must be an integer of 0 or greater/);
      assert.match(text, /unknown field "day"/);
      assert.match(text, /status must be draft, active, or archived/);
      assert.match(text, /day must be an integer from 1 to 7/);
      assert.match(text, /workout must be between 1 and 160/);
      return true;
    },
  );
});

test("a block without an exercise needs a type, and an exercise block needs a name", () => {
  assert.throws(() => parseCatalog({ workouts: [{ name: "Push", blocks: [{}] }] }), /needs an exercise or a type/);
  assert.throws(() => parseCatalog({ workouts: [{ name: "Push", blocks: [{ type: "exercise" }] }] }), /needs an exercise name/);

  const notes = parseCatalog({ workouts: [{ name: "Push", blocks: [{ type: "notes", title: "Breathe" }] }] });
  assert.equal(notes.workouts[0]?.blocks[0]?.blockType, "notes");
  assert.equal(notes.workouts[0]?.blocks[0]?.exercise, null);
});

test("programs and workouts can point at catalog ids", () => {
  const exerciseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workoutId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const document = parseCatalog({
    exercises: [{ id: exerciseId, name: "Bench Press" }],
    workouts: [{ id: workoutId, name: "Push A", blocks: [{ exercise_id: exerciseId, sets: 4, reps: 6 }] }],
    programs: [{ name: "Push Pull", phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout_id: workoutId }] }] }] }],
  });
  assert.equal(document.exercises[0]?.id, exerciseId);
  assert.equal(document.workouts[0]?.blocks[0]?.exerciseId, exerciseId);
  assert.equal(document.workouts[0]?.blocks[0]?.exercise, null);
  assert.equal(document.programs[0]?.phases[0]?.weeks[0]?.days[0]?.workoutId, workoutId);
  assert.equal(document.programs[0]?.phases[0]?.weeks[0]?.days[0]?.workoutName, null);
});

test("a reference cannot use a name and an id together", () => {
  assert.throws(
    () => parseCatalog({ workouts: [{ name: "Push", blocks: [{ exercise: "Bench Press", exercise_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] }] }),
    /use an exercise name or exercise_id, not both/,
  );
  assert.throws(
    () =>
      parseCatalog({
        programs: [{ name: "Push Pull", phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout: "Push A", workout_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] }] }] }],
      }),
    /use a workout name or workout_id, not both/,
  );
  assert.throws(() => parseCatalog({ exercises: [{ id: "not-a-uuid", name: "Bench Press" }] }), /must be a uuid/);
});

test("every content column can be set, including the database column names", () => {
  const document = parseCatalog({
    exercises: [
      {
        name: "Bench Press",
        primary_muscle_group: "chest",
        secondary_muscle_group: "triceps",
        tracking_type: "weight_reps",
      },
    ],
    workouts: [
      {
        name: "Push A",
        estimated_duration_minutes: 45,
        is_template: false,
        blocks: [
          {
            exercise: "Bench Press",
            position: 2,
            prescribed_sets: 4,
            prescribed_reps_min: 6,
            prescribed_reps_max: 8,
            prescribed_load: 60,
            load_unit: "kg",
            rest_seconds: 120,
            tempo: "31X1",
            rpe_target: 8.5,
            instructions: "Pause on the chest",
            configuration: { grip: "medium" },
            prescribed_duration_seconds: 0,
            prescribed_distance_meters: 1.5,
            prescribed_height_cm: 40,
          },
          { type: "notes", title: "Warm up" },
        ],
      },
    ],
    programs: [
      {
        name: "Push Pull",
        estimated_duration_weeks: 10,
        phases: [
          {
            name: "Peak",
            position: 2,
            weeks: [
              {
                week_number: 3,
                name: "Heavy",
                notes: "Leave a rep in reserve",
                days: [{ day_number: 1, workout: "Push A", title_override: "Push", notes: "First session" }],
              },
            ],
          },
        ],
      },
    ],
  });

  const exercise = document.exercises[0];
  assert.equal(exercise?.muscle, "chest");
  assert.equal(exercise?.secondaryMuscleGroup, "triceps");
  assert.equal(exercise?.trackingType, "weight_reps");
  assert.deepEqual(exercise?.trackingParameters, ["weight", "reps"]);

  const workout = document.workouts[0];
  assert.equal(workout?.minutes, 45);
  assert.equal(workout?.isTemplate, false);
  assert.deepEqual(
    workout?.blocks.map((block) => block.position),
    [2, 1],
  );
  const block = workout?.blocks[0];
  assert.equal(block?.sets, 4);
  assert.deepEqual({ min: block?.repsMin, max: block?.repsMax }, { min: 6, max: 8 });
  assert.equal(block?.load, 60);
  assert.equal(block?.loadUnit, "kg");
  assert.equal(block?.restSeconds, 120);
  assert.equal(block?.tempo, "31X1");
  assert.equal(block?.rpeTarget, 8.5);
  assert.equal(block?.instructions, "Pause on the chest");
  assert.deepEqual(block?.configuration, { grip: "medium" });
  assert.equal(block?.durationSeconds, 0);
  assert.equal(block?.distanceMeters, 1.5);
  assert.equal(block?.heightCm, 40);

  const program = document.programs[0];
  assert.equal(program?.estimatedDurationWeeks, 10);
  assert.equal(program?.phases[0]?.position, 2);
  const week = program?.phases[0]?.weeks[0];
  assert.equal(week?.weekNumber, 3);
  assert.equal(week?.notes, "Leave a rep in reserve");
  assert.equal(week?.days[0]?.day, 1);
  assert.equal(week?.days[0]?.titleOverride, "Push");
  assert.equal(week?.days[0]?.notes, "First session");
});

test("tracking and muscle rules reject incomplete values", () => {
  assert.throws(
    () => parseCatalog({ exercises: [{ name: "Bench Press", muscle: "chest", secondary_muscle_group: "Chest" }] }),
    /secondary muscle group must differ/,
  );
  assert.throws(
    () => parseCatalog({ exercises: [{ name: "Bench Press", tracking_type: "custom" }] }),
    /custom tracking needs at least one parameter/,
  );
  assert.throws(
    () => parseCatalog({ exercises: [{ name: "Bench Press", tracking_parameters: ["weight"] }] }),
    /tracking_type is required/,
  );
});

test("the same day position cannot be used twice", () => {
  assert.throws(
    () =>
      parseCatalog({
        programs: [
          {
            name: "Push Pull",
            phases: [{ name: "Base", weeks: [{ days: [{ day: 1, workout: "Push A", position: 1 }, { day: 1, workout: "Push B", position: 1 }] }] }],
          },
        ],
      }),
    /day 1 position 1 is used more than once/,
  );
});
