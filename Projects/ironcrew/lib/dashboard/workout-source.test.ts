import assert from "node:assert/strict";
import { test } from "node:test";

import { workoutSourceFromRow, workoutSourceLabel } from "./workout-source";

test("a self-scheduled workout with no program name stays labeled", () => {
  const source = workoutSourceFromRow({
    assigned_by_client_id: "client-1",
    program_assignments: { program_id: "program-1", programs: null },
    trainers: null,
  });
  assert.equal(source.programId, "program-1");
  assert.equal(source.programName, "Self-made program");
  assert.equal(source.givenBy, "Self");
  assert.equal(workoutSourceLabel(source), "Self-made program · Self");
});

test("a trainer-assigned workout uses the trainer name", () => {
  const source = workoutSourceFromRow({
    assigned_by_client_id: null,
    program_assignments: [{ program_id: "program-1", programs: [{ name: "Build" }] }],
    trainers: { first_name: "Ada", last_name: "Lovelace", business_name: "Iron" },
  });
  assert.equal(source.programName, "Build");
  assert.equal(source.givenBy, "Ada Lovelace");
});

test("a workout outside a program has no program", () => {
  const source = workoutSourceFromRow({ trainers: { business_name: "Iron Coaching" } });
  assert.equal(source.programName, null);
  assert.equal(source.givenBy, "Iron Coaching");
});
