import assert from "node:assert/strict";
import { test } from "node:test";

import { formatLongDate } from "./client-week";
import {
  canEditLiveWorkout,
  defaultLiveWorkoutName,
  exerciseUsableForLiveWorkout,
  liveWorkoutBlockDenial,
  mergeDraftBlocks,
  parseAddExercise,
  parseStartWorkout,
} from "./live-workout";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EXERCISE = "33333333-3333-4333-8333-333333333333";

test("a live workout name defaults to the day it is for", () => {
  assert.equal(defaultLiveWorkoutName("2026-11-19"), `Workout · ${formatLongDate("2026-11-19")}`);
});

test("start workout requires a name and a real date", () => {
  assert.equal(parseStartWorkout(null).ok, false);
  assert.equal(parseStartWorkout({ name: "   ", scheduled_for: "2026-11-19" }).ok, false);
  assert.equal(parseStartWorkout({ name: "A".repeat(161), scheduled_for: "2026-11-19" }).ok, false);
  assert.equal(parseStartWorkout({ name: "Push", scheduled_for: "2026-02-31" }).ok, false);
  assert.equal(parseStartWorkout({ name: 1, scheduled_for: "2026-11-19" }).ok, false);

  const parsed = parseStartWorkout({ name: "  Push  ", scheduled_for: "2026-11-19" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, { name: "Push", scheduledFor: "2026-11-19" });
  }
});

test("add exercise requires an exercise id", () => {
  assert.equal(parseAddExercise({}).ok, false);
  assert.equal(parseAddExercise({ exercise_id: "nope" }).ok, false);
  const parsed = parseAddExercise({ exercise_id: EXERCISE });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.exerciseId, EXERCISE);
});

test("block edits are rejected unless the client owns a self-scheduled workout that is not on a program", () => {
  const allowed = {
    callerClientId: CLIENT,
    assignmentClientId: CLIENT,
    assignedByClientId: CLIENT,
    ownerClientId: CLIENT,
    onProgram: false,
  };

  assert.equal(liveWorkoutBlockDenial(allowed), null);
  assert.equal(liveWorkoutBlockDenial({ ...allowed, assignmentClientId: OTHER })?.status, 404);
  assert.equal(liveWorkoutBlockDenial({ ...allowed, assignmentClientId: null })?.status, 404);
  assert.equal(liveWorkoutBlockDenial({ ...allowed, assignedByClientId: null })?.status, 403);
  assert.equal(liveWorkoutBlockDenial({ ...allowed, assignedByClientId: OTHER })?.status, 403);
  assert.equal(liveWorkoutBlockDenial({ ...allowed, ownerClientId: null })?.status, 403);
  assert.equal(liveWorkoutBlockDenial({ ...allowed, ownerClientId: OTHER })?.status, 403);
  assert.equal(liveWorkoutBlockDenial({ ...allowed, onProgram: true })?.status, 409);
});

test("a client can edit exercises only on a workout they own that is not on a program", () => {
  assert.equal(canEditLiveWorkout({ ownedByClient: true, onProgram: false }), true);
  assert.equal(canEditLiveWorkout({ ownedByClient: true, onProgram: true }), false);
  assert.equal(canEditLiveWorkout({ ownedByClient: false, onProgram: false }), false);
});

test("a live workout can use an exercise the client owns or a system exercise", () => {
  assert.equal(exerciseUsableForLiveWorkout(null, CLIENT).ok, false);
  assert.equal(exerciseUsableForLiveWorkout({ ownerClientId: CLIENT, trainerId: null }, CLIENT).ok, true);
  assert.equal(exerciseUsableForLiveWorkout({ ownerClientId: null, trainerId: null }, CLIENT).ok, true);
  assert.equal(exerciseUsableForLiveWorkout({ ownerClientId: OTHER, trainerId: null }, CLIENT).ok, false);
  assert.equal(exerciseUsableForLiveWorkout({ ownerClientId: null, trainerId: OTHER }, CLIENT).ok, false);
});

test("merging blocks keeps drafts for exercises that remain and appends new ones", () => {
  const merged = mergeDraftBlocks(
    [
      { id: "a", note: "draft" },
      { id: "gone", note: "old" },
    ],
    [
      { id: "a", note: "server" },
      { id: "b", note: "new" },
    ],
  );
  assert.deepEqual(merged, [
    { id: "a", note: "draft" },
    { id: "b", note: "new" },
  ]);
});
