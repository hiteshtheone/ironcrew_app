import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClientExercise, ClientLoggedSet } from "./client-week";
import { draftSets, fieldsFromCoach, fieldsFromLog, previousSetsForBlock, type PriorResult } from "./workout-prefill";

test("a fresh workout shows the coach weight and the low end of the rep range", () => {
  const [set] = draftSets(exercise({ load: 60, repsMin: 6, repsMax: 8 }));
  assert.equal(set?.trainer.load, "60");
  assert.equal(set?.trainer.repetitions, "6");
  assert.equal(set?.trainer.loadUnit, "kg");
  assert.equal(set?.current.load, "");
  assert.equal(set?.current.repetitions, "");
});

test("a coach rep target with no minimum uses the maximum", () => {
  const [set] = draftSets(exercise({ repsMax: 8 }));
  assert.equal(set?.trainer.repetitions, "8");
});

test("an empty coach field stays empty and the previous log stays on its own row", () => {
  const [set] = draftSets(
    exercise({
      repsMin: 6,
      repsMax: 8,
      previousSets: [logged({ setNumber: 1, load: 50, repetitions: 8 })],
    }),
  );
  assert.equal(set?.trainer.load, "");
  assert.equal(set?.trainer.repetitions, "6");
  assert.equal(set?.previous.load, "50");
  assert.equal(set?.previous.repetitions, "8");
  assert.equal(set?.current.load, "");
  assert.equal(set?.current.repetitions, "");
});

test("a workout with no coach values shows each previous set", () => {
  const sets = draftSets(
    exercise({
      prescribedSets: null,
      previousSets: [
        logged({ setNumber: 1, load: 40, repetitions: 10 }),
        logged({ setNumber: 2, load: 45, repetitions: 8 }),
      ],
    }),
  );
  assert.deepEqual(
    sets.map((set) => ({ load: set.previous.load, repetitions: set.previous.repetitions })),
    [
      { load: "40", repetitions: "10" },
      { load: "45", repetitions: "8" },
    ],
  );
  assert.equal(sets[0]?.trainer.load, "");
  assert.equal(sets[0]?.current.load, "");
});

test("a value saved on this session stays on the current row", () => {
  const [set] = draftSets(
    exercise({
      load: 60,
      repsMin: 6,
      sets: [logged({ setNumber: 1, load: 70, repetitions: null, loadUnit: "lb" })],
    }),
  );
  assert.equal(set?.current.load, "70");
  assert.equal(set?.current.loadUnit, "lb");
  assert.equal(set?.current.repetitions, "");
  assert.equal(set?.trainer.load, "60");
  assert.equal(set?.trainer.repetitions, "6");
});

test("a saved zero stays on the current row", () => {
  const [set] = draftSets(exercise({ load: 60, sets: [logged({ setNumber: 1, load: 0 })] }));
  assert.equal(set?.current.load, "0");
  assert.equal(set?.trainer.load, "60");
});

test("current fields do not copy trainer or previous values", () => {
  const [set] = draftSets(
    exercise({
      load: 60,
      previousSets: [logged({ setNumber: 1, load: 40, notes: "last week" })],
    }),
  );
  assert.equal(set?.trainer.load, "60");
  assert.equal(set?.previous.load, "40");
  assert.equal(set?.current.load, "");
});

test("distance is shown in kilometers", () => {
  const [set] = draftSets(exercise({ distanceMeters: 1500 }));
  assert.equal(set?.trainer.distanceKm, "1.5");
});

test("an empty field with no history stays blank", () => {
  const [set] = draftSets(exercise());
  for (const row of [set?.trainer, set?.previous, set?.current]) {
    assert.equal(row?.load, "");
    assert.equal(row?.repetitions, "");
    assert.equal(row?.durationSeconds, "");
    assert.equal(row?.distanceKm, "");
    assert.equal(row?.heightCm, "");
    assert.equal(row?.heartRateBpm, "");
  }
});

test("the coach set count limits how many previous sets are shown", () => {
  const sets = draftSets(
    exercise({
      prescribedSets: 1,
      previousSets: [logged({ setNumber: 1, load: 40 }), logged({ setNumber: 2, load: 50 })],
    }),
  );
  assert.equal(sets.length, 1);
  assert.equal(sets[0]?.previous.load, "40");
});

test("a newly added set keeps the trainer and previous values apart from the blank current fields", () => {
  const prescription = exercise({ load: 60, repsMin: 6 });
  const trainer = fieldsFromCoach(prescription);
  const previous = fieldsFromLog(logged({ setNumber: 2, load: 55, repetitions: 8 }), prescription.loadUnit);
  const current = fieldsFromLog(undefined, prescription.loadUnit);
  assert.equal(trainer.load, "60");
  assert.equal(trainer.repetitions, "6");
  assert.equal(previous.load, "55");
  assert.equal(previous.repetitions, "8");
  assert.equal(current.load, "");
  assert.equal(current.repetitions, "");
});

test("previous logs prefer the same block, then the same exercise, and skip this session and later days", () => {
  const results: PriorResult[] = [
    prior("future", "2026-11-10", "block-1", "ex-1", logged({ setNumber: 1, load: 90 })),
    prior("today", "2026-11-07", "block-1", "ex-1", logged({ setNumber: 1, load: 80 })),
    prior("monday", "2026-11-03", "block-1", "ex-1", logged({ setNumber: 1, load: 50 })),
    prior("last-week", "2026-10-27", "block-1", "ex-1", logged({ setNumber: 1, load: 40 })),
    prior("other-block", "2026-11-05", "block-9", "ex-1", logged({ setNumber: 1, load: 70 })),
  ];

  const sameBlock = previousSetsForBlock(results, {
    assignmentId: "today",
    scheduledFor: "2026-11-07",
    blockId: "block-1",
    exerciseId: "ex-1",
  });
  assert.equal(sameBlock[0]?.load, 50);

  const newBlock = previousSetsForBlock(results, {
    assignmentId: "today",
    scheduledFor: "2026-11-07",
    blockId: "block-new",
    exerciseId: "ex-1",
  });
  assert.equal(newBlock[0]?.load, 70);
});

function exercise(overrides: Partial<ClientExercise> = {}): ClientExercise {
  return {
    id: "block-1",
    exerciseId: "ex-1",
    name: "Squat",
    detail: null,
    prescribedSets: 1,
    repsMin: null,
    repsMax: null,
    load: null,
    loadUnit: "kg",
    durationSeconds: null,
    distanceMeters: null,
    heightCm: null,
    heartRateBpm: null,
    trackingParameters: ["weight", "reps"],
    primaryMuscleGroup: null,
    secondaryMuscleGroup: null,
    sets: [],
    previousSets: [],
    ...overrides,
  };
}

function logged(overrides: Partial<ClientLoggedSet> & Pick<ClientLoggedSet, "setNumber">): ClientLoggedSet {
  return {
    repetitions: null,
    load: null,
    loadUnit: "kg",
    durationSeconds: null,
    distanceMeters: null,
    heightCm: null,
    heartRateBpm: null,
    notes: null,
    ...overrides,
  };
}

function prior(
  assignmentId: string,
  scheduledFor: string,
  blockId: string,
  exerciseId: string,
  set: ClientLoggedSet,
): PriorResult {
  return {
    assignmentId,
    scheduledFor,
    startedAt: `${scheduledFor}T00:00:00.000Z`,
    createdAt: `${scheduledFor}T00:00:00.000Z`,
    blockId,
    exerciseId,
    set,
  };
}
