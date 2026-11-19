import assert from "node:assert/strict";
import { test } from "node:test";

import { timeOnlyBlockParameters } from "./tracking";

test("warm-up and cool-down record time only", () => {
  assert.deepEqual(timeOnlyBlockParameters("warmup"), ["time"]);
  assert.deepEqual(timeOnlyBlockParameters("cooldown"), ["time"]);
});

test("other block types keep the caller's tracking list", () => {
  assert.equal(timeOnlyBlockParameters("exercise"), null);
  assert.equal(timeOnlyBlockParameters("superset"), null);
  assert.equal(timeOnlyBlockParameters("circuit"), null);
  assert.equal(timeOnlyBlockParameters("conditioning"), null);
  assert.equal(timeOnlyBlockParameters("notes"), null);
  assert.equal(timeOnlyBlockParameters(null), null);
});
