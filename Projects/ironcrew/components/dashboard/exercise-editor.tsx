"use client";

import { FormEvent, useState } from "react";

import { DeleteControl, EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import type { ExerciseOption } from "@/lib/dashboard/load-trainer-programs";
import { muscleGroupsMatch } from "@/lib/exercises/muscle-group";
import {
  isTrackingType,
  parametersFor,
  TRACKING_PARAMETER_LABELS,
  TRACKING_PARAMETERS,
  TRACKING_TYPE_LABELS,
  TRACKING_TYPES,
  type ExerciseTrackingType,
  type TrackingParameter,
} from "@/lib/exercises/tracking";

const fieldClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50";

type ExerciseSnapshot = {
  name: string;
  trackingType: ExerciseTrackingType;
  customParameters: TrackingParameter[];
  primaryMuscleGroup: string;
  secondaryMuscleGroup: string;
};

export function ExerciseEditor({
  exercise,
  pending,
  onSave,
  onDelete,
}: {
  exercise: ExerciseOption;
  pending: string | null;
  onSave: (exerciseId: string, body: Record<string, unknown>) => Promise<boolean>;
  onDelete: (exerciseId: string) => Promise<boolean>;
}) {
  const [snapshot, setSnapshot] = useState<ExerciseSnapshot>(() => exerciseSnapshot(exercise));
  const [loadedId, setLoadedId] = useState(exercise.id);
  const [baseline, setBaseline] = useState<ExerciseSnapshot>(() => exerciseSnapshot(exercise));
  const { editing, startEditing, stopEditing } = useEditMode(exercise.id);

  if (exercise.id !== loadedId) {
    const next = exerciseSnapshot(exercise);
    setLoadedId(exercise.id);
    setSnapshot(next);
    setBaseline(next);
  }

  const fieldsLocked = !editing || exercise.isSystem;
  const muscleGroupsConflict = muscleGroupsMatch(snapshot.primaryMuscleGroup, snapshot.secondaryMuscleGroup);
  const missingPrimary = snapshot.primaryMuscleGroup.trim().length === 0;
  const missingCustomParameters = snapshot.trackingType === "custom" && snapshot.customParameters.length === 0;
  const valid = snapshot.name.trim().length > 0 && !missingPrimary && !missingCustomParameters && !muscleGroupsConflict;
  const dirty = !valuesEqual(persistedExercise(snapshot), persistedExercise(baseline));

  const cancelEdit = () => {
    setSnapshot(baseline);
    stopEditing();
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !dirty || !valid || exercise.isSystem) return;
    const saved = persistedExercise(snapshot);
    const savedSnapshot: ExerciseSnapshot = {
      ...snapshot,
      name: saved.name,
      primaryMuscleGroup: saved.primaryMuscleGroup,
      secondaryMuscleGroup: saved.secondaryMuscleGroup,
    };
    const didSave = await onSave(exercise.id, {
      name: saved.name,
      tracking_type: saved.trackingType,
      tracking_parameters: saved.trackingParameters,
      primary_muscle_group: saved.primaryMuscleGroup,
      secondary_muscle_group: saved.secondaryMuscleGroup || null,
    });
    if (!didSave) return;
    setSnapshot(savedSnapshot);
    setBaseline(savedSnapshot);
    stopEditing();
  };

  const update = (patch: Partial<ExerciseSnapshot>) => {
    setSnapshot((current) => ({ ...current, ...patch }));
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-bold">Exercise</h2>
        <p className="mt-1 text-sm text-slate-500">
          {exercise.isSystem
            ? "This system exercise is available to everyone."
            : "Edit the name, the fields a set records, and the muscle groups."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-600">Name</span>
          <input
            required
            maxLength={160}
            disabled={fieldsLocked}
            value={snapshot.name}
            onChange={(event) => update({ name: event.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-600">Tracks</span>
          <select
            disabled={fieldsLocked}
            value={snapshot.trackingType}
            onChange={(event) => {
              const next = isTrackingType(event.target.value) ? event.target.value : snapshot.trackingType;
              const customParameters =
                next === "custom" && snapshot.trackingType !== "custom"
                  ? parametersFor(snapshot.trackingType, snapshot.customParameters)
                  : snapshot.customParameters;
              update({ trackingType: next, customParameters });
            }}
            className={fieldClass}
          >
            {TRACKING_TYPES.map((type) => (
              <option key={type} value={type}>{TRACKING_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-600">Primary muscle group</span>
          <input
            maxLength={80}
            disabled={fieldsLocked}
            value={snapshot.primaryMuscleGroup}
            onChange={(event) => update({ primaryMuscleGroup: event.target.value })}
            placeholder="Chest"
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-600">Secondary muscle group</span>
          <input
            maxLength={80}
            disabled={fieldsLocked}
            value={snapshot.secondaryMuscleGroup}
            onChange={(event) => update({ secondaryMuscleGroup: event.target.value })}
            placeholder="Optional"
            className={fieldClass}
          />
        </label>
        {muscleGroupsConflict ? (
          <p className="text-sm text-red-600 sm:col-span-2">Secondary muscle group must be different from the primary muscle group.</p>
        ) : null}
        {editing && missingPrimary ? (
          <p className="text-sm text-slate-500 sm:col-span-2">A primary muscle group is required.</p>
        ) : null}
        {snapshot.trackingType === "custom" ? (
          <fieldset className="sm:col-span-2" disabled={fieldsLocked}>
            <legend className="text-sm font-medium text-slate-600">Parameters</legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {TRACKING_PARAMETERS.map((parameter) => (
                <label key={parameter} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={snapshot.customParameters.includes(parameter)}
                    onChange={(event) => {
                      const customParameters = event.target.checked
                        ? [...snapshot.customParameters, parameter]
                        : snapshot.customParameters.filter((item) => item !== parameter);
                      update({ customParameters });
                    }}
                  />
                  {TRACKING_PARAMETER_LABELS[parameter]}
                </label>
              ))}
            </div>
            {missingCustomParameters ? <p className="mt-2 text-sm text-slate-500">Choose at least one parameter.</p> : null}
          </fieldset>
        ) : null}
      </div>

      {exercise.isSystem ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <EditSaveActions
            editing={editing}
            dirty={dirty && valid}
            pending={pending === "save-exercise"}
            saveLabel="Save exercise"
            onEdit={startEditing}
            onCancel={cancelEdit}
          />
          <DeleteControl
            key={exercise.id}
            itemLabel="exercise"
            detail={`Delete ${exercise.name}? Workouts that use it keep the block without this exercise. An exercise with logged results is kept.`}
            pending={pending === "delete-exercise"}
            disabled={pending !== null && pending !== "delete-exercise"}
            onDelete={() => {
              void onDelete(exercise.id);
            }}
          />
        </div>
      )}
    </form>
  );
}

function exerciseSnapshot(exercise: ExerciseOption): ExerciseSnapshot {
  return {
    name: exercise.name,
    trackingType: exercise.trackingType,
    customParameters: exercise.trackingType === "custom" ? [...exercise.trackingParameters] : ["weight", "reps"],
    primaryMuscleGroup: exercise.primaryMuscleGroup ?? "",
    secondaryMuscleGroup: exercise.secondaryMuscleGroup ?? "",
  };
}

function persistedExercise(snapshot: ExerciseSnapshot) {
  return {
    name: snapshot.name.trim(),
    trackingType: snapshot.trackingType,
    trackingParameters:
      snapshot.trackingType === "custom" ? snapshot.customParameters : parametersFor(snapshot.trackingType, null),
    primaryMuscleGroup: snapshot.primaryMuscleGroup.trim(),
    secondaryMuscleGroup: snapshot.secondaryMuscleGroup.trim(),
  };
}
