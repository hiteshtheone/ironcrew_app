import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeAssignedPrograms, type TrainerProgram } from "./load-trainer-programs";

function program(id: string, name: string): TrainerProgram {
  return {
    id,
    name,
    description: null,
    status: "active",
    isSystem: false,
    readOnly: false,
    phases: [],
    assignedClients: [{ id: "other-client", name: "Other Client" }],
  };
}

test("merge keeps an owned program editable and lists an assigned program once, read-only", () => {
  const owned = program("owned", "My plan");
  const duplicate = program("owned", "My plan");
  const assigned = program("trainer", "Coach plan");

  const merged = mergeAssignedPrograms([owned], [duplicate, assigned]);

  assert.deepEqual(
    merged.map((item) => item.id),
    ["trainer", "owned"],
  );
  assert.equal(merged.find((item) => item.id === "owned")?.readOnly, false);
  assert.deepEqual(merged.find((item) => item.id === "owned")?.assignedClients, owned.assignedClients);
  const coach = merged.find((item) => item.id === "trainer");
  assert.equal(coach?.readOnly, true);
  assert.deepEqual(coach?.assignedClients, []);
});
