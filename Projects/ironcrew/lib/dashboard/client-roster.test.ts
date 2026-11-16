import assert from "node:assert/strict";
import { test } from "node:test";

import { clientRosterSignal, type RosterAssignment, type RosterMonths } from "./client-roster";

const TODAY = "2026-11-16";
const MONTHS: RosterMonths = {
  thisStart: "2026-11-01",
  thisEnd: "2026-11-30",
  previousStart: "2026-10-01",
  previousEnd: "2026-10-31",
};

test("cancelled workouts are left out of this month's consistency", () => {
  const signal = clientRosterSignal(
    [
      row({ scheduledFor: "2026-11-02", status: "completed" }),
      row({ scheduledFor: "2026-11-03", status: "completed" }),
      row({ scheduledFor: "2026-11-04", status: "completed" }),
      row({ scheduledFor: "2026-11-05", status: "scheduled" }),
      row({ scheduledFor: "2026-11-06", status: "cancelled" }),
      row({ scheduledFor: "2026-11-07", status: "cancelled" }),
      row({ scheduledFor: "2026-10-06", status: "completed" }),
      row({ scheduledFor: "2026-10-07", status: "skipped" }),
    ],
    [],
    MONTHS,
    TODAY,
  );

  assert.equal(signal.consistencyPercent, 75);
  assert.equal(signal.consistencyDelta, "+25%");
});

test("a month with no scheduled workouts has no consistency percent", () => {
  const signal = clientRosterSignal(
    [row({ scheduledFor: "2026-11-04", status: "cancelled" })],
    [],
    MONTHS,
    TODAY,
  );

  assert.equal(signal.consistencyPercent, null);
  assert.equal(signal.consistencyDelta, "No workouts this month");
});

test("consistency change versus last month is signed, flat, or new", () => {
  const down = clientRosterSignal(
    [
      row({ scheduledFor: "2026-11-02", status: "completed" }),
      row({ scheduledFor: "2026-11-03", status: "skipped" }),
      row({ scheduledFor: "2026-10-02", status: "completed" }),
    ],
    [],
    MONTHS,
    TODAY,
  );
  const flat = clientRosterSignal(
    [
      row({ scheduledFor: "2026-11-02", status: "completed" }),
      row({ scheduledFor: "2026-10-02", status: "completed" }),
    ],
    [],
    MONTHS,
    TODAY,
  );
  const fresh = clientRosterSignal(
    [row({ scheduledFor: "2026-11-02", status: "completed" })],
    [],
    MONTHS,
    TODAY,
  );

  assert.equal(down.consistencyPercent, 50);
  assert.equal(down.consistencyDelta, "-50%");
  assert.equal(flat.consistencyDelta, "0%");
  assert.equal(fresh.consistencyDelta, "New");
});

test("a skipped workout is not the last workout", () => {
  const signal = clientRosterSignal(
    [],
    [
      row({ scheduledFor: "2026-11-15", status: "skipped", workoutName: "Skip day" }),
      row({ scheduledFor: "2026-11-10", status: "completed", workoutName: "Squat day" }),
    ],
    MONTHS,
    TODAY,
  );

  assert.equal(signal.lastWorkoutName, "Squat day");
  assert.equal(signal.lastWorkoutOn, "2026-11-10");
});

test("a future scheduled workout is not the last workout", () => {
  const signal = clientRosterSignal(
    [],
    [
      row({ scheduledFor: "2026-11-20", status: "scheduled", workoutName: "Future" }),
      row({ scheduledFor: "2026-11-12", status: "completed", workoutName: "Upper" }),
    ],
    MONTHS,
    TODAY,
  );

  assert.equal(signal.lastWorkoutName, "Upper");
  assert.equal(signal.lastWorkoutOn, "2026-11-12");
});

test("an older completed workout stays the last workout without changing this month", () => {
  const signal = clientRosterSignal(
    [row({ scheduledFor: "2026-11-02", status: "scheduled", workoutName: "Pending" })],
    [row({ scheduledFor: "2026-08-01", status: "completed", workoutName: "August lift" })],
    MONTHS,
    TODAY,
  );

  assert.equal(signal.consistencyPercent, 0);
  assert.equal(signal.consistencyDelta, "New");
  assert.equal(signal.lastWorkoutName, "August lift");
  assert.equal(signal.lastWorkoutOn, "2026-08-01");
});

test("no completed workout leaves the last workout empty", () => {
  const signal = clientRosterSignal([], [], MONTHS, TODAY);

  assert.equal(signal.lastWorkoutName, null);
  assert.equal(signal.lastWorkoutOn, null);
});

function row(overrides: Partial<RosterAssignment> & Pick<RosterAssignment, "scheduledFor" | "status">): RosterAssignment {
  return {
    clientId: "client-1",
    workoutName: "Workout",
    ...overrides,
  };
}
