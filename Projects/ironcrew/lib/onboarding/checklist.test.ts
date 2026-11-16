import assert from "node:assert/strict";
import { test } from "node:test";

import { checklistProgress, clientChecklist, isChecklistVisible, trainerChecklist } from "./checklist";
import { rankStarterPrograms } from "./starter-programs";
import { resumeStep, stepPosition } from "./steps";

const newTrainer = {
  hasBusinessName: false,
  clientCount: 0,
  programCount: 0,
  assignmentCount: 0,
  linkedClientCount: 0,
};

test("a new trainer has every item open", () => {
  const items = trainerChecklist(newTrainer);
  assert.equal(items.length, 5);
  assert.ok(items.every((item) => !item.done));
  assert.equal(isChecklistVisible(items, null), true);
});

test("trainer items follow the data", () => {
  const items = trainerChecklist({ ...newTrainer, hasBusinessName: true, clientCount: 2, programCount: 1 });
  assert.deepEqual(
    items.filter((item) => item.done).map((item) => item.id),
    ["profile", "client", "program"],
  );
  assert.deepEqual(checklistProgress(items), { done: 3, total: 5, percent: 60 });
});

test("the checklist hides once everything is done", () => {
  const items = trainerChecklist({
    hasBusinessName: true,
    clientCount: 1,
    programCount: 1,
    assignmentCount: 1,
    linkedClientCount: 1,
  });
  assert.equal(isChecklistVisible(items, null), false);
});

test("dismissing hides the checklist even with open items", () => {
  assert.equal(isChecklistVisible(trainerChecklist(newTrainer), "2026-11-13T07:00:00Z"), false);
});

test("a client goal is only done when a goal exists", () => {
  const facts = { hasGoal: false, hasStartedProgram: true, hasLoggedWorkout: true };
  const open = clientChecklist(facts).filter((item) => !item.done).map((item) => item.id);
  assert.deepEqual(open, ["goal"]);
  assert.equal(clientChecklist({ ...facts, hasGoal: true }).every((item) => item.done), true);
});

test("programs matching the goal are suggested first", () => {
  const programs = [
    { name: "Beginner 10K", description: "Build up to a 10k run" },
    { name: "Full body strength", description: null },
    { name: "Mobility basics", description: "Daily stretching" },
  ];
  const ranked = rankStarterPrograms(programs, "strength");
  assert.deepEqual(
    ranked.map((entry) => [entry.program.name, entry.suggested]),
    [
      ["Full body strength", true],
      ["Beginner 10K", false],
      ["Mobility basics", false],
    ],
  );
  assert.ok(rankStarterPrograms(programs, null).every((entry) => !entry.suggested));
});

test("a saved step resumes only inside its own flow", () => {
  assert.equal(resumeStep("trainer", "first_client"), "first_client");
  assert.equal(resumeStep("trainer", "training_days"), "business");
  assert.equal(resumeStep("invited", null), "welcome");
});

test("step numbers count the role step except for invited clients", () => {
  assert.deepEqual(stepPosition("client", "goal"), { current: 2, total: 4 });
  assert.deepEqual(stepPosition("invited", "goal"), { current: 2, total: 2 });
});
