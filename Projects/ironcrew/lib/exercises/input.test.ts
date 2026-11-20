import assert from "node:assert/strict";
import { test } from "node:test";

import { exerciseWriteError, parseExerciseWrite } from "./input";

test("create accepts a name and defaults the tracking type", async () => {
  const parsed = parseExerciseWrite({ name: "  Bench press  " }, "create");
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  assert.equal(parsed.value.name, "Bench press");
  assert.equal(parsed.value.trackingType, "weight_reps");
  assert.deepEqual(parsed.value.trackingParameters, ["weight", "reps"]);
  assert.equal(parsed.value.primaryMuscleGroup, null);
});

test("update requires a tracking type and a primary muscle", async () => {
  const missing = parseExerciseWrite({ name: "Row" }, "update");
  assert.equal("error" in missing && missing.error.status, 400);

  const parsed = parseExerciseWrite(
    {
      name: "Row",
      tracking_type: "custom",
      tracking_parameters: ["reps", "heart_rate"],
      primary_muscle_group: "lats",
      secondary_muscle_groups: ["biceps"],
      body_parts: ["upper_body"],
    },
    "update",
  );
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  assert.deepEqual(parsed.value.trackingParameters, ["reps", "heart_rate"]);
  assert.deepEqual(parsed.value.secondaryMuscleGroups, ["biceps"]);
});

test("a secondary muscle cannot repeat the primary muscle", async () => {
  const parsed = parseExerciseWrite(
    {
      name: "Row",
      tracking_type: "weight_reps",
      primary_muscle_group: "lats",
      secondary_muscle_groups: ["lats"],
    },
    "create",
  );
  assert.equal("error" in parsed && parsed.error.status, 400);
  if (!("error" in parsed)) return;
  assert.equal((await parsed.error.json()).error, "Secondary muscle group must be different from the primary muscle group");
});

test("database write errors map to conflict, validation, and permission statuses", async () => {
  const duplicate = exerciseWriteError({ code: "23505", message: "duplicate" });
  assert.equal(duplicate.status, 409);
  const muscles = exerciseWriteError({ code: "23514", message: "exercises_muscle_groups_distinct" });
  assert.equal(muscles.status, 400);
  const denied = exerciseWriteError({ message: "row-level security" });
  assert.equal(denied.status, 403);
});
