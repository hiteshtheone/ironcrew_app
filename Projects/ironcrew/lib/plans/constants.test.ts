import assert from "node:assert/strict";
import { test } from "node:test";

import { isBlockType, isGoalStatus, isGoalType } from "./constants";

test("goal and block guards accept the stored values only", () => {
  assert.equal(isGoalType("fat_loss"), true);
  assert.equal(isGoalType("Fat loss"), false);
  assert.equal(isGoalStatus("paused"), true);
  assert.equal(isGoalStatus("done"), false);
  assert.equal(isBlockType("warmup"), true);
  assert.equal(isBlockType("cardio"), false);
});
