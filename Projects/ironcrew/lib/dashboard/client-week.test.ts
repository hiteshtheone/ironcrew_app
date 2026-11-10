import assert from "node:assert/strict";
import { test } from "node:test";

import { workoutCompletionPercent } from "./client-week";

test("a workout with no exercises is 0 percent", () => {
  assert.equal(workoutCompletionPercent({ exercises: [] }), 0);
});

test("a workout with nothing logged is 0 percent", () => {
  assert.equal(workoutCompletionPercent({ exercises: [{ sets: [] }, { sets: [] }] }), 0);
});

test("a partial log is the share of exercises with saved sets", () => {
  assert.equal(
    workoutCompletionPercent({
      exercises: [{ sets: [{ setNumber: 1 }] }, { sets: [] }, { sets: [] }],
    }),
    33,
  );
});
