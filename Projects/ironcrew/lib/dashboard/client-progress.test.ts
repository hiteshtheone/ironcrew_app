import assert from "node:assert/strict";
import { test } from "node:test";

import { buildClientProgress, type ProgressSet } from "./client-progress";

const WEEK = "2026-11-09";

test("primary muscle keeps 60 percent of used weight and secondaries split the rest", () => {
  const report = buildClientProgress(WEEK, [], [
    set({
      load: 100,
      repetitions: 10,
      muscleGroup: "chest",
      secondaryMuscleGroups: ["triceps", "shoulders"],
    }),
  ]);

  const byName = Object.fromEntries(report.bodyParts.map((part) => [part.name, part]));
  assert.equal(byName.Chest?.weightKg, 60);
  assert.equal(byName.Triceps?.weightKg, 20);
  assert.equal(byName.Shoulders?.weightKg, 20);
  assert.equal(byName.Chest?.reps, 10);
  assert.equal(byName.Triceps?.reps, 10);
  assert.equal(byName.Shoulders?.reps, 10);
  assert.equal(byName.Chest?.maxWeightKg, 100);
  assert.equal(byName.Triceps?.maxWeightKg, 100);
});

test("a set with no secondary muscle keeps all of its weight on the primary", () => {
  const report = buildClientProgress(WEEK, [], [
    set({ load: 80, repetitions: 5, muscleGroup: "quadriceps", secondaryMuscleGroups: [] }),
  ]);

  assert.deepEqual(
    report.bodyParts.map((part) => ({ name: part.name, weightKg: part.weightKg, reps: part.reps })),
    [{ name: "Quadriceps", weightKg: 80, reps: 5 }],
  );
});

test("a secondary muscle that matches the primary is not counted twice", () => {
  const report = buildClientProgress(WEEK, [], [
    set({ load: 50, repetitions: 4, muscleGroup: "chest", secondaryMuscleGroups: ["chest", "triceps"] }),
  ]);

  const byName = Object.fromEntries(report.bodyParts.map((part) => [part.name, part.weightKg]));
  assert.equal(byName.Chest, 30);
  assert.equal(byName.Triceps, 20);
});

test("several sets show the average weight per rep, not the total", () => {
  const report = buildClientProgress(WEEK, [], [
    set({ load: 100, repetitions: 10, muscleGroup: "chest", secondaryMuscleGroups: [] }),
    set({ load: 50, repetitions: 10, muscleGroup: "chest", secondaryMuscleGroups: [] }),
  ]);

  const chest = report.bodyParts.find((part) => part.name === "Chest");
  assert.equal(chest?.weightKg, 75);
  assert.equal(chest?.reps, 20);
});

function set(overrides: Partial<ProgressSet> & Pick<ProgressSet, "muscleGroup" | "secondaryMuscleGroups">): ProgressSet {
  return {
    scheduledFor: WEEK,
    repetitions: null,
    load: null,
    loadUnit: "kg",
    distanceMeters: null,
    exerciseName: "Bench Press",
    equipment: "barbell",
    ...overrides,
  };
}
