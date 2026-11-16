"use client";

import { useEffect, useId, useRef } from "react";

import { muscleGroupLabel, prescriptionDetail } from "@/lib/dashboard/client-week";
import {
  libraryItemLabel,
  type ExerciseOption,
  type LibraryWorkout,
  type WorkoutBlock,
} from "@/lib/dashboard/load-trainer-programs";
import { MUSCLE_LABELS } from "@/lib/exercises/muscle-group";
import { TRACKING_PARAMETER_LABELS, TRACKING_TYPE_LABELS } from "@/lib/exercises/tracking";
import { BLOCK_TYPE_LABELS, isBlockType } from "@/lib/plans/constants";

export type LibraryDetail =
  | { kind: "workout"; workoutId: string }
  | { kind: "exercise"; exerciseId: string; workoutId?: string };

const PREVIEW_BLOCKS = 3;

export function exerciseSummary(exercise: ExerciseOption) {
  const tracking = TRACKING_TYPE_LABELS[exercise.trackingType];
  return exercise.primaryMuscleGroup ? `${tracking} · ${MUSCLE_LABELS[exercise.primaryMuscleGroup]}` : tracking;
}

export function blockSummary(block: WorkoutBlock) {
  const name = block.exerciseName || block.title || blockTypeName(block.blockType);
  const detail = prescriptionDetail(block.sets, block.repsMin, block.repsMax, {
    load: block.load,
    loadUnit: block.loadUnit,
    durationSeconds: block.durationSeconds,
    distanceMeters: block.distanceMeters,
    heightCm: block.heightCm,
    heartRateBpm: block.heartRateBpm,
  });
  return detail ? `${name} · ${detail}` : name;
}

/** Duration and the first exercise names, for the workouts list. */
export function workoutListSummary(workout: LibraryWorkout) {
  const names = workout.blocks
    .map((block) => block.exerciseName || block.title)
    .filter((name): name is string => Boolean(name));
  const shown = names.slice(0, PREVIEW_BLOCKS);
  const extra = names.length - shown.length;
  const duration = workout.durationMinutes != null ? `${workout.durationMinutes} min` : null;
  const exercises =
    shown.length === 0 ? null : extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
  if (duration || exercises) return [duration, exercises].filter(Boolean).join(" · ");
  if (workout.blocks.length === 0) return "No blocks yet";
  return `${workout.blocks.length} block${workout.blocks.length === 1 ? "" : "s"}`;
}

export function DayWorkoutSummary({
  workout,
  onDetails,
}: {
  workout: LibraryWorkout;
  onDetails: () => void;
}) {
  const shown = workout.blocks.slice(0, PREVIEW_BLOCKS);
  const extra = workout.blocks.length - shown.length;

  return (
    <div className="mt-3 space-y-1">
      <p className="text-sm font-semibold text-slate-900">{libraryItemLabel(workout.name, workout.isSystem)}</p>
      {workout.durationMinutes != null ? (
        <p className="text-xs text-slate-500">{workout.durationMinutes} min</p>
      ) : null}
      {workout.description ? <p className="line-clamp-2 text-xs text-slate-500">{workout.description}</p> : null}
      {shown.length > 0 ? (
        <ul className="space-y-0.5">
          {shown.map((block) => (
            <li key={block.id} className="truncate text-xs text-slate-600">
              {blockSummary(block)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">No blocks yet</p>
      )}
      {extra > 0 ? <p className="text-xs text-slate-400">+{extra} more</p> : null}
      <button
        type="button"
        aria-label={`Workout details for ${workout.name}`}
        onClick={onDetails}
        className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
      >
        Workout details
      </button>
    </div>
  );
}

export function LibraryDetailDialog({
  detail,
  workouts,
  exercises,
  onClose,
  onOpenExercise,
  onBackToWorkout,
}: {
  detail: LibraryDetail | null;
  workouts: LibraryWorkout[];
  exercises: ExerciseOption[];
  onClose: () => void;
  onOpenExercise: (exerciseId: string, workoutId?: string) => void;
  onBackToWorkout: (workoutId: string) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [detail]);

  if (!detail) return null;

  const workout = detail.kind === "workout" ? workouts.find((item) => item.id === detail.workoutId) ?? null : null;
  const exercise =
    detail.kind === "exercise" ? exercises.find((item) => item.id === detail.exerciseId) ?? null : null;
  const returnWorkoutId = detail.kind === "exercise" ? detail.workoutId : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-950">
            {detail.kind === "workout" ? "Workout details" : "Exercise details"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {returnWorkoutId ? (
          <button
            type="button"
            onClick={() => onBackToWorkout(returnWorkoutId)}
            className="mt-2 text-sm font-semibold text-slate-700 underline-offset-2 hover:underline"
          >
            Back to workout
          </button>
        ) : null}

        {detail.kind === "workout" ? (
          workout ? (
            <WorkoutDetailBody
              workout={workout}
              exercises={exercises}
              onOpenExercise={(exerciseId) => onOpenExercise(exerciseId, workout.id)}
            />
          ) : (
            <p className="mt-4 text-sm text-slate-500">This workout is no longer in your library.</p>
          )
        ) : exercise ? (
          <ExerciseDetailBody exercise={exercise} />
        ) : (
          <p className="mt-4 text-sm text-slate-500">This exercise is no longer in your library.</p>
        )}
      </div>
    </div>
  );
}

function WorkoutDetailBody({
  workout,
  exercises,
  onOpenExercise,
}: {
  workout: LibraryWorkout;
  exercises: ExerciseOption[];
  onOpenExercise: (exerciseId: string) => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-base font-semibold text-slate-950">{libraryItemLabel(workout.name, workout.isSystem)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {workout.durationMinutes != null ? `${workout.durationMinutes} min` : "No duration"}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
          {workout.description?.trim() || "No description"}
        </p>
      </div>
      {workout.blocks.length === 0 ? (
        <p className="text-sm text-slate-500">No blocks yet.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {workout.blocks.map((block, index) => {
            const exercise = block.exerciseId
              ? exercises.find((item) => item.id === block.exerciseId) ?? null
              : null;
            const prescribed = prescriptionDetail(block.sets, block.repsMin, block.repsMax, {
              load: block.load,
              loadUnit: block.loadUnit,
              durationSeconds: block.durationSeconds,
              distanceMeters: block.distanceMeters,
              heightCm: block.heightCm,
              heartRateBpm: block.heartRateBpm,
            });
            return (
              <li key={block.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-slate-900">
                  {index + 1}. {block.exerciseName || block.title || blockTypeName(block.blockType)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{blockTypeName(block.blockType)}</p>
                <p className="mt-1 text-sm text-slate-600">{prescribed ?? "No prescription"}</p>
                {exercise ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">{exerciseSummary(exercise)}</p>
                    <button
                      type="button"
                      onClick={() => onOpenExercise(exercise.id)}
                      className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
                    >
                      Exercise details
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ExerciseDetailBody({ exercise }: { exercise: ExerciseOption }) {
  const muscles = muscleGroupLabel(
    exercise.primaryMuscleGroup,
    exercise.secondaryMuscleGroups,
    exercise.bodyParts,
  );
  const records = exercise.trackingParameters.map((parameter) => TRACKING_PARAMETER_LABELS[parameter]).join(", ");

  return (
    <div className="mt-4 space-y-4">
      <p className="text-base font-semibold text-slate-950">{libraryItemLabel(exercise.name, exercise.isSystem)}</p>
      <dl className="grid gap-3 text-sm">
        <DetailFact label="Description" value={exercise.description?.trim() || "None"} />
        <DetailFact label="Instructions" value={exercise.instructions?.trim() || "None"} pre />
        <DetailFact label="Tracking" value={TRACKING_TYPE_LABELS[exercise.trackingType]} />
        <DetailFact label="Records" value={records || "None"} />
        <DetailFact label="Muscles and body parts" value={muscles || "None"} />
      </dl>
    </div>
  );
}

function DetailFact({ label, value, pre = false }: { label: string; value: string; pre?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-slate-800 ${pre ? "whitespace-pre-wrap" : ""}`}>{value}</dd>
    </div>
  );
}

function blockTypeName(blockType: string) {
  return isBlockType(blockType) ? BLOCK_TYPE_LABELS[blockType] : blockType;
}
