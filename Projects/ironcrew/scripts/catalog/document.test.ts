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
    days.map((day) => [day.day, day.position, day.workout]),
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
