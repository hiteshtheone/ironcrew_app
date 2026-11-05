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
  description: string;
  instructions: string;
  trackingType: ExerciseTrackingType;
  customParameters: TrackingParameter[];
  primaryMuscleGroup: string;
  secondaryMuscleGroup: string;
};

const blankExercise: ExerciseOption = {
  id: "new",
  name: "",
  description: null,
  instructions: null,
  isSystem: false,
  trackingType: "weight_reps",
  trackingParameters: ["weight", "reps"],
  primaryMuscleGroup: null,
  secondaryMuscleGroup: null,
};

export function ExerciseEditor({
  exercise,
  pending,
  creating = false,
  onSave,
  onCreate,
  onCancelCreate,
  onDelete,
}: {
  exercise: ExerciseOption | null;
  pending: string | null;
  creating?: boolean;
  onSave: (exerciseId: string, body: Record<string, unknown>) => Promise<boolean>;
  onCreate?: (body: Record<string, unknown>) => Promise<boolean>;
  onCancelCreate?: () => void;
  onDelete: (exerciseId: string) => Promise<boolean>;
}) {
  const source = creating || !exercise ? blankExercise : exercise;
  const [snapshot, setSnapshot] = useState<ExerciseSnapshot>(() => exerciseSnapshot(source));
  const [loadedId, setLoadedId] = useState(source.id);
  const [baseline, setBaseline] = useState<ExerciseSnapshot>(() => exerciseSnapshot(source));
  const { editing, startEditing, stopEditing } = useEditMode(source.id);
  const editable = creating || (editing && !source.isSystem);

  if (source.id !== loadedId) {
    const next = exerciseSnapshot(source);
    setLoadedId(source.id);
    setSnapshot(next);
    setBaseline(next);
  }

  const fieldsLocked = !editable;
  const muscleGroupsConflict = muscleGroupsMatch(snapshot.primaryMuscleGroup, snapshot.secondaryMuscleGroup);
  const missingPrimary = snapshot.primaryMuscleGroup.trim().length === 0;
  const missingCustomParameters = snapshot.trackingType === "custom" && snapshot.customParameters.length === 0;
  const valid = snapshot.name.trim().length > 0
    && !missingCustomParameters
    && !muscleGroupsConflict
    && (creating || !missingPrimary);
  const dirty = !valuesEqual(persistedExercise(snapshot), persistedExercise(baseline));

  const cancelEdit = () => {
    if (creating) {
      onCancelCreate?.();
      return;
    }
    setSnapshot(baseline);
    stopEditing();
  };

  const exerciseBody = (saved: ReturnType<typeof persistedExercise>) => ({
    name: saved.name,
    description: saved.description || null,
    instructions: saved.instructions || null,
    tracking_type: saved.trackingType,
    tracking_parameters: saved.trackingParameters,
    primary_muscle_group: saved.primaryMuscleGroup,
    secondary_muscle_group: saved.secondaryMuscleGroup || null,
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editable || !dirty || !valid || source.isSystem) return;
    const saved = persistedExercise(snapshot);
    const savedSnapshot: ExerciseSnapshot = {
      ...snapshot,
      name: saved.name,
      description: saved.description,
      instructions: saved.instructions,
      primaryMuscleGroup: saved.primaryMuscleGroup,
      secondaryMuscleGroup: saved.secondaryMuscleGroup,
    };
    if (creating) {
      if (!onCreate) return;
      await onCreate(exerciseBody(saved));
      return;
    }
    if (!exercise || exercise.id === "new") return;
    const didSave = await onSave(exercise.id, exerciseBody(saved));
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
          {creating
            ? "Enter a name, what a set records, the muscle groups, and any description or instructions."
            : source.isSystem
              ? "This system exercise is available to everyone."
              : "Edit the name, the fields a set records, the muscle groups, and the description or instructions."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-600">Name</span>
          <input
            required
            autoFocus={creating}
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
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-600">Description</span>
          <textarea
            maxLength={4000}
            disabled={fieldsLocked}
            value={snapshot.description}
            onChange={(event) => update({ description: event.target.value })}
            rows={2}
            placeholder="Optional"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-600">Instructions</span>
          <textarea
            maxLength={4000}
            disabled={fieldsLocked}
            value={snapshot.instructions}
            onChange={(event) => update({ instructions: event.target.value })}
            rows={4}
            placeholder="Optional"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
        {muscleGroupsConflict ? (
          <p className="text-sm text-red-600 sm:col-span-2">Secondary muscle group must be different from the primary muscle group.</p>
        ) : null}
        {!creating && editing && missingPrimary ? (
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

      {source.isSystem ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <EditSaveActions
            editing={editable}
            dirty={dirty && valid}
            pending={pending === (creating ? "create-exercise" : "save-exercise")}
            saveLabel={creating ? "Create exercise" : "Save exercise"}
            pendingLabel={creating ? "Creating..." : "Saving..."}
            onEdit={startEditing}
            onCancel={cancelEdit}
          />
          {creating || !exercise || exercise.id === "new" ? null : (
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
          )}
        </div>
      )}
    </form>
  );
}

function exerciseSnapshot(exercise: ExerciseOption): ExerciseSnapshot {
  return {
    name: exercise.name,
    description: exercise.description ?? "",
    instructions: exercise.instructions ?? "",
    trackingType: exercise.trackingType,
    customParameters: exercise.trackingType === "custom" ? [...exercise.trackingParameters] : ["weight", "reps"],
    primaryMuscleGroup: exercise.primaryMuscleGroup ?? "",
    secondaryMuscleGroup: exercise.secondaryMuscleGroup ?? "",
  };
}

function persistedExercise(snapshot: ExerciseSnapshot) {
  return {
    name: snapshot.name.trim(),
    description: snapshot.description.trim(),
    instructions: snapshot.instructions.trim(),
    trackingType: snapshot.trackingType,
    trackingParameters:
      snapshot.trackingType === "custom" ? snapshot.customParameters : parametersFor(snapshot.trackingType, null),
    primaryMuscleGroup: snapshot.primaryMuscleGroup.trim(),
    secondaryMuscleGroup: snapshot.secondaryMuscleGroup.trim(),
  };
}
