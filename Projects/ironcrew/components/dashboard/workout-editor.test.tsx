import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ExerciseOption, LibraryWorkout } from "@/lib/dashboard/load-trainer-programs";

import { WorkoutEditor } from "./workout-editor";

test("warm-up and cool-down blocks show time, and an exercise block keeps its own fields", () => {
  const html = renderToStaticMarkup(
    <WorkoutEditor
      workouts={[workout()]}
      exercises={[bench()]}
      selectedWorkoutId="workout-1"
      pending={null}
      onDuplicate={() => undefined}
      onSave={async () => true}
      onDelete={async () => true}
    />,
  );

  const blocks = html.split("Block ").slice(1);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0]?.includes("Time (sec)"), true);
  assert.equal(blocks[0]?.includes("Reps min"), false);
  assert.equal(blocks[0]?.includes(">Load<"), false);
  assert.equal(blocks[1]?.includes("Reps min"), true);
  assert.equal(blocks[1]?.includes(">Load<"), true);
  assert.equal(blocks[1]?.includes("Time (sec)"), false);
  assert.equal(blocks[2]?.includes("Time (sec)"), true);
  assert.equal(blocks[2]?.includes("Reps min"), false);
  assert.equal(blocks[2]?.includes("Sets"), true);
  assert.equal(blocks[2]?.includes("Rest seconds"), true);
});

function workout(): LibraryWorkout {
  return {
    id: "workout-1",
    name: "Upper Body",
    isSystem: false,
    description: null,
    durationMinutes: 40,
    blocks: [
      {
        id: "warmup",
        blockType: "warmup",
        exerciseId: null,
        exerciseName: null,
        title: "Warm up",
        position: 1,
        sets: 1,
        repsMin: 10,
        repsMax: 12,
        load: 20,
        loadUnit: "kg",
        restSeconds: 30,
        durationSeconds: 300,
        distanceMeters: null,
        heightCm: null,
        heartRateBpm: null,
      },
      {
        id: "press",
        blockType: "exercise",
        exerciseId: "bench",
        exerciseName: "Bench Press",
        title: null,
        position: 2,
        sets: 3,
        repsMin: 6,
        repsMax: 8,
        load: 100,
        loadUnit: "kg",
        restSeconds: 90,
        durationSeconds: null,
        distanceMeters: null,
        heightCm: null,
        heartRateBpm: null,
      },
      {
        id: "cooldown",
        blockType: "cooldown",
        exerciseId: null,
        exerciseName: null,
        title: "Cool down",
        position: 3,
        sets: 1,
        repsMin: 8,
        repsMax: null,
        load: 10,
        loadUnit: "kg",
        restSeconds: null,
        durationSeconds: 180,
        distanceMeters: 200,
        heightCm: null,
        heartRateBpm: null,
      },
    ],
  };
}

function bench(): ExerciseOption {
  return {
    id: "bench",
    name: "Bench Press",
    description: null,
    instructions: null,
    isSystem: true,
    trackingType: "weight_reps",
    trackingParameters: ["weight", "reps"],
    primaryMuscleGroup: "chest",
    secondaryMuscleGroups: [],
    bodyParts: ["upper_body"],
  };
}
