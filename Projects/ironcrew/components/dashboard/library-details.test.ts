import assert from "node:assert/strict";
import { test } from "node:test";

import type { WorkoutBlock } from "../../lib/dashboard/load-trainer-programs";

import { blockSummary } from "./library-details";

test("a warm-up or cool-down summary shows sets and duration only", () => {
  const block = workoutBlock({
    blockType: "warmup",
    title: "Warm up",
    sets: 1,
    repsMin: 10,
    repsMax: 12,
    load: 20,
    durationSeconds: 300,
    distanceMeters: 400,
  });

  assert.equal(blockSummary(block), "Warm up · 1 set · 300 sec");
  assert.equal(blockSummary({ ...block, blockType: "cooldown", title: "Cool down" }), "Cool down · 1 set · 300 sec");
});

test("an exercise summary still shows the stored prescription", () => {
  const block = workoutBlock({
    blockType: "exercise",
    exerciseName: "Bench Press",
    sets: 3,
    repsMin: 6,
    repsMax: 8,
    load: 100,
  });

  assert.equal(blockSummary(block), "Bench Press · 3 sets · 100 kg · 6–8 reps");
});

function workoutBlock(overrides: Partial<WorkoutBlock>): WorkoutBlock {
  return {
    id: "block-1",
    blockType: "exercise",
    exerciseId: null,
    exerciseName: null,
    title: null,
    position: 1,
    sets: null,
    repsMin: null,
    repsMax: null,
    load: null,
    loadUnit: null,
    restSeconds: null,
    durationSeconds: null,
    distanceMeters: null,
    heightCm: null,
    heartRateBpm: null,
    ...overrides,
  };
}
