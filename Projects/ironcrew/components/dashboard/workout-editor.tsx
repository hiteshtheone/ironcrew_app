"use client";

import { FormEvent, useEffect, useState } from "react";

import { DeleteControl, EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import { libraryItemLabel, type ExerciseOption, type LibraryWorkout } from "@/lib/dashboard/load-trainer-programs";
import {
  isTrackingType,
  parametersFor,
  TRACKING_PARAMETER_LABELS,
  TRACKING_PARAMETERS,
  TRACKING_TYPE_LABELS,
  TRACKING_TYPES,
  tracks,
  type ExerciseTrackingType,
  type TrackingParameter,
} from "@/lib/exercises/tracking";
import { muscleGroupsMatch } from "@/lib/exercises/muscle-group";
import { BLOCK_TYPE_LABELS, BLOCK_TYPES, isBlockType, type BlockType } from "@/lib/plans/constants";

const fieldClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50";

type WorkoutSnapshot = {
  name: string;
  description: string;
  duration: string;
  blocks: BlockDraft[];
};

const emptyWorkoutSnapshot: WorkoutSnapshot = { name: "", description: "", duration: "", blocks: [] };

type BlockDraft = {
  key: string;
  blockType: BlockType;
  exerciseId: string;
  title: string;
  sets: string;
  repsMin: string;
  repsMax: string;
  load: string;
  loadUnit: string;
  restSeconds: string;
  durationSeconds: string;
  distanceKm: string;
  heightCm: string;
};

export function WorkoutEditor({
  workouts,
  exercises,
  selectedWorkoutId,
  pending,
  onSelect,
  onDuplicate,
  onSave,
  onDelete,
  onCreateExercise,
}: {
  workouts: LibraryWorkout[];
  exercises: ExerciseOption[];
  selectedWorkoutId: string | null;
  pending: string | null;
  onSelect: (workoutId: string) => void;
  onDuplicate: (workoutId: string) => void;
  onSave: (workoutId: string, body: Record<string, unknown>) => Promise<boolean>;
  onDelete: (workoutId: string) => Promise<boolean>;
  onCreateExercise: (input: {
    name: string;
    trackingType: ExerciseTrackingType;
    trackingParameters: TrackingParameter[];
    primaryMuscleGroup: string;
    secondaryMuscleGroup: string;
  }) => Promise<ExerciseOption | null>;
}) {
  const requested = workouts.find((workout) => workout.id === selectedWorkoutId) ?? null;
  const selected = requested ?? (selectedWorkoutId ? null : workouts[0] ?? null);
  const [name, setName] = useState(selected?.name ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [duration, setDuration] = useState(selected?.durationMinutes == null ? "" : String(selected.durationMinutes));
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (selected ? selected.blocks.map(toDraft) : []));
  const [exerciseName, setExerciseName] = useState("");
  const [trackingType, setTrackingType] = useState<ExerciseTrackingType>("weight_reps");
  const [customParameters, setCustomParameters] = useState<TrackingParameter[]>(["weight", "reps"]);
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState("");
  const [secondaryMuscleGroup, setSecondaryMuscleGroup] = useState("");
  const [knownExercises, setKnownExercises] = useState(exercises);
  const workoutId = selected?.id ?? "";
  const [loadedId, setLoadedId] = useState(workoutId);
  const [baseline, setBaseline] = useState<WorkoutSnapshot>(() => (selected ? workoutSnapshot(selected) : emptyWorkoutSnapshot));
  const { editing, startEditing, stopEditing } = useEditMode(workoutId);

  if (workoutId !== loadedId) {
    const next = selected ? workoutSnapshot(selected) : emptyWorkoutSnapshot;
    setLoadedId(workoutId);
    setName(next.name);
    setDescription(next.description);
    setDuration(next.duration);
    setBlocks(next.blocks);
    setBaseline(next);
  }

  const currentSnapshot: WorkoutSnapshot = { name, description, duration, blocks };
  const dirty = !valuesEqual(currentSnapshot, baseline);

  useEffect(() => {
    setKnownExercises((current) => {
      const ids = new Set(exercises.map((exercise) => exercise.id));
      const pendingExercises = current.filter((exercise) => !ids.has(exercise.id));
      return [...exercises, ...pendingExercises].sort(compareExercises);
    });
  }, [exercises]);

  const cancelEdit = () => {
    setName(baseline.name);
    setDescription(baseline.description);
    setDuration(baseline.duration);
    setBlocks(baseline.blocks);
    stopEditing();
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !editing || !dirty) return;
    const nextBaseline: WorkoutSnapshot = { name, description, duration, blocks };
    const saved = await onSave(selected.id, {
      name,
      description: description.trim() || null,
      estimated_duration_minutes: duration.trim() === "" ? null : Number(duration),
      blocks: blocks.map((block) => {
        const parameters = prescriptionParameters(block, knownExercises);
        return {
          id: block.key,
          block_type: block.blockType,
          exercise_id: block.blockType === "exercise" ? block.exerciseId || null : null,
          title: block.title.trim() || null,
          prescribed_sets: emptyNumber(block.sets),
          prescribed_reps_min: includeParameter(parameters, "reps") ? emptyNumber(block.repsMin) : null,
          prescribed_reps_max: includeParameter(parameters, "reps") ? emptyNumber(block.repsMax) : null,
          prescribed_load: includeParameter(parameters, "weight") ? emptyNumber(block.load) : null,
          load_unit: includeParameter(parameters, "weight") ? block.loadUnit.trim() || null : null,
          rest_seconds: emptyNumber(block.restSeconds),
          prescribed_duration_seconds: includeParameter(parameters, "time") ? emptyNumber(block.durationSeconds) : null,
          prescribed_distance_meters: includeParameter(parameters, "distance") ? kilometersToMeters(block.distanceKm) : null,
          prescribed_height_cm: includeParameter(parameters, "height") ? emptyNumber(block.heightCm) : null,
        };
      }),
    });
    if (!saved) return;
    setBaseline(nextBaseline);
    stopEditing();
  };

  const createExercise = () => {
    const trackingParameters = trackingType === "custom" ? [...customParameters] : parametersFor(trackingType, null);
    if (
      exerciseName.trim().length === 0 ||
      primaryMuscleGroup.trim().length === 0 ||
      trackingParameters.length === 0 ||
      muscleGroupsMatch(primaryMuscleGroup, secondaryMuscleGroup)
    ) {
      return;
    }
    void onCreateExercise({
      name: exerciseName,
      trackingType,
      trackingParameters,
      primaryMuscleGroup,
      secondaryMuscleGroup,
    }).then((created) => {
      if (!created) return;
      setKnownExercises((current) =>
        current.some((exercise) => exercise.id === created.id)
          ? current
          : [...current, created].sort(compareExercises),
      );
      setExerciseName("");
      setTrackingType("weight_reps");
      setCustomParameters(["weight", "reps"]);
      setPrimaryMuscleGroup("");
      setSecondaryMuscleGroup("");
    });
  };

  const updateBlock = (key: string, patch: Partial<BlockDraft>) => {
    setBlocks((current) => current.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    setBlocks((current) => {
      const next = [...current];
      const target = index + direction;
      const moving = next[index];
      const displaced = next[target];
      if (!moving || !displaced) return current;
      next[index] = displaced;
      next[target] = moving;
      return next;
    });
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Workout</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selected?.isSystem
              ? "This system workout is available to everyone. Duplicate it to make your own copy."
              : "Edit sets, reps, and blocks. A duplicate can be changed on its own."}
          </p>
        </div>
        <button
          type="button"
          disabled={!selected || pending === "duplicate-workout"}
          onClick={() => selected && onDuplicate(selected.id)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending === "duplicate-workout" ? "Duplicating..." : "Duplicate workout"}
        </button>
      </div>

      {workouts.length === 0 ? (
        <p className="text-sm text-slate-500">Create a workout in the Workouts list, then write its blocks here.</p>
      ) : !selected ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Opening this workout...</p>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Library workout</span>
            <select value="" onChange={(event) => onSelect(event.target.value)} className={fieldClass}>
              <option value="">Select</option>
              {workouts.map((workout) => (
                <option key={workout.id} value={workout.id}>{libraryItemLabel(workout.name, workout.isSystem)}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Library workout</span>
            <select
              value={selected?.id ?? ""}
              onChange={(event) => onSelect(event.target.value)}
              className={fieldClass}
            >
              {workouts.map((workout) => (
                <option key={workout.id} value={workout.id}>{libraryItemLabel(workout.name, workout.isSystem)}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Name</span>
              <input required maxLength={160} disabled={!editing} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Minutes</span>
              <input
                type="number"
                min="1"
                step="1"
                disabled={!editing}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-600">Description</span>
              <textarea
                value={description}
                disabled={!editing}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">New exercise</span>
              <input
                value={exerciseName}
                onChange={(event) => setExerciseName(event.target.value)}
                maxLength={160}
                placeholder="Exercise name"
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Tracks</span>
              <select
                value={trackingType}
                onChange={(event) => {
                  const next = isTrackingType(event.target.value) ? event.target.value : trackingType;
                  if (next === "custom" && trackingType !== "custom") {
                    setCustomParameters(parametersFor(trackingType, customParameters));
                  }
                  setTrackingType(next);
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
                value={primaryMuscleGroup}
                onChange={(event) => setPrimaryMuscleGroup(event.target.value)}
                maxLength={80}
                placeholder="Chest"
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Secondary muscle group</span>
              <input
                value={secondaryMuscleGroup}
                onChange={(event) => setSecondaryMuscleGroup(event.target.value)}
                maxLength={80}
                placeholder="Optional"
                className={fieldClass}
              />
            </label>
            {muscleGroupsMatch(primaryMuscleGroup, secondaryMuscleGroup) ? (
              <p className="text-sm text-red-600 sm:col-span-2">Secondary muscle group must be different from the primary muscle group.</p>
            ) : null}
            {trackingType === "custom" ? (
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-slate-600">Parameters</legend>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {TRACKING_PARAMETERS.map((parameter) => (
                    <label key={parameter} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={customParameters.includes(parameter)}
                        onChange={(event) => {
                          setCustomParameters((current) =>
                            event.target.checked
                              ? [...current, parameter]
                              : current.filter((item) => item !== parameter),
                          );
                        }}
                      />
                      {TRACKING_PARAMETER_LABELS[parameter]}
                    </label>
                  ))}
                </div>
                {customParameters.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Choose at least one parameter.</p>
                ) : null}
              </fieldset>
            ) : null}
            {selected.isSystem ? (
              <p className="text-sm text-slate-500 sm:col-span-2">Saved to your library. Duplicate this workout to place it on a copy.</p>
            ) : null}
            <div>
              <button
                type="button"
                disabled={
                  pending === "exercise" ||
                  exerciseName.trim().length === 0 ||
                  primaryMuscleGroup.trim().length === 0 ||
                  (trackingType === "custom" && customParameters.length === 0) ||
                  muscleGroupsMatch(primaryMuscleGroup, secondaryMuscleGroup)
                }
                onClick={createExercise}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {pending === "exercise" ? "Adding..." : "Add exercise"}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Blocks</h3>
              {selected.isSystem ? null : (
              <button
                type="button"
                disabled={!editing}
                onClick={() => setBlocks((current) => [...current, emptyBlock(knownExercises[0]?.id ?? "")])}
                className="text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Add block
              </button>
              )}
            </div>
            {blocks.length === 0 ? <p className="text-sm text-slate-500">No blocks yet.</p> : null}
            {blocks.map((block, index) => (
              <div key={block.key} className="space-y-3 rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">Block {index + 1}</span>
                  {selected.isSystem ? null : (
                  <div className="flex gap-2 text-sm">
                    <button type="button" disabled={!editing || index === 0} onClick={() => moveBlock(index, -1)} className="font-semibold disabled:opacity-40">Up</button>
                    <button type="button" disabled={!editing || index === blocks.length - 1} onClick={() => moveBlock(index, 1)} className="font-semibold disabled:opacity-40">Down</button>
                    <button type="button" disabled={!editing} onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))} className="font-semibold text-red-600 disabled:opacity-40">Remove</button>
                  </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-600">Type</span>
                    <select
                      value={block.blockType}
                      disabled={!editing}
                      onChange={(event) => updateBlock(block.key, { blockType: isBlockType(event.target.value) ? event.target.value : block.blockType })}
                      className={fieldClass}
                    >
                      {BLOCK_TYPES.map((type) => (
                        <option key={type} value={type}>{BLOCK_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                  </label>
                  {block.blockType === "exercise" ? (
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-600">Exercise</span>
                      <select
                        required
                        disabled={!editing}
                        value={block.exerciseId}
                        onChange={(event) => updateBlock(block.key, { exerciseId: event.target.value })}
                        className={fieldClass}
                      >
                        <option value="">Select</option>
                        {knownExercises.map((exercise) => (
                          <option key={exercise.id} value={exercise.id}>{libraryItemLabel(exercise.name, exercise.isSystem)}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="font-medium text-slate-600">Title</span>
                    <input maxLength={160} disabled={!editing} value={block.title} onChange={(event) => updateBlock(block.key, { title: event.target.value })} className={fieldClass} />
                  </label>
                  <NumberField label="Sets" value={block.sets} disabled={!editing} onChange={(sets) => updateBlock(block.key, { sets })} />
                  {showsParameter(block, knownExercises, "reps") ? (
                    <>
                      <NumberField label="Reps min" value={block.repsMin} disabled={!editing} onChange={(repsMin) => updateBlock(block.key, { repsMin })} />
                      <NumberField label="Reps max" value={block.repsMax} disabled={!editing} onChange={(repsMax) => updateBlock(block.key, { repsMax })} />
                    </>
                  ) : null}
                  {showsParameter(block, knownExercises, "weight") ? (
                    <>
                      <NumberField label="Load" value={block.load} disabled={!editing} onChange={(load) => updateBlock(block.key, { load })} step="any" />
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-600">Load unit</span>
                        <input maxLength={20} disabled={!editing} value={block.loadUnit} onChange={(event) => updateBlock(block.key, { loadUnit: event.target.value })} className={fieldClass} />
                      </label>
                    </>
                  ) : null}
                  {showsParameter(block, knownExercises, "time") ? (
                    <NumberField label="Time (sec)" value={block.durationSeconds} disabled={!editing} onChange={(durationSeconds) => updateBlock(block.key, { durationSeconds })} />
                  ) : null}
                  {showsParameter(block, knownExercises, "distance") ? (
                    <NumberField label="Distance (km)" value={block.distanceKm} disabled={!editing} onChange={(distanceKm) => updateBlock(block.key, { distanceKm })} step="any" />
                  ) : null}
                  {showsParameter(block, knownExercises, "height") ? (
                    <NumberField label="Height (cm)" value={block.heightCm} disabled={!editing} onChange={(heightCm) => updateBlock(block.key, { heightCm })} step="any" />
                  ) : null}
                  <NumberField label="Rest seconds" value={block.restSeconds} disabled={!editing} onChange={(restSeconds) => updateBlock(block.key, { restSeconds })} />
                </div>
              </div>
            ))}
          </div>

          {selected.isSystem ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <EditSaveActions
              editing={editing}
              dirty={dirty}
              pending={pending === "save-workout"}
              saveLabel="Save workout"
              saveClassName="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              editClassName="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onEdit={startEditing}
              onCancel={cancelEdit}
            />
            <DeleteControl
              key={selected.id}
              itemLabel="workout"
              detail={`Delete ${selected.name}? This cannot be undone. A workout still on a program or calendar is kept.`}
              pending={pending === "delete-workout"}
              disabled={pending !== null && pending !== "delete-workout"}
              onDelete={() => {
                void onDelete(selected.id);
              }}
            />
          </div>
          )}
        </>
      )}
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      <input type="number" min="0" step={step} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </label>
  );
}

function compareExercises(left: ExerciseOption, right: ExerciseOption) {
  if (left.isSystem !== right.isSystem) return left.isSystem ? 1 : -1;
  return left.name.localeCompare(right.name);
}

function workoutSnapshot(workout: LibraryWorkout): WorkoutSnapshot {
  return {
    name: workout.name,
    description: workout.description ?? "",
    duration: workout.durationMinutes == null ? "" : String(workout.durationMinutes),
    blocks: workout.blocks.map(toDraft),
  };
}

function toDraft(block: LibraryWorkout["blocks"][number]): BlockDraft {
  return {
    key: block.id,
    blockType: isBlockType(block.blockType) ? block.blockType : "exercise",
    exerciseId: block.exerciseId ?? "",
    title: block.title ?? "",
    sets: block.sets == null ? "" : String(block.sets),
    repsMin: block.repsMin == null ? "" : String(block.repsMin),
    repsMax: block.repsMax == null ? "" : String(block.repsMax),
    load: block.load == null ? "" : String(block.load),
    loadUnit: block.loadUnit ?? "",
    restSeconds: block.restSeconds == null ? "" : String(block.restSeconds),
    durationSeconds: block.durationSeconds == null ? "" : String(block.durationSeconds),
    distanceKm: metersToKm(block.distanceMeters),
    heightCm: block.heightCm == null ? "" : String(block.heightCm),
  };
}

function emptyBlock(exerciseId: string): BlockDraft {
  return {
    key: crypto.randomUUID(),
    blockType: exerciseId ? "exercise" : "notes",
    exerciseId,
    title: "",
    sets: "",
    repsMin: "",
    repsMax: "",
    load: "",
    loadUnit: "",
    restSeconds: "",
    durationSeconds: "",
    distanceKm: "",
    heightCm: "",
  };
}

function emptyNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function metersToKm(meters: number | null) {
  if (meters == null) return "";
  return String(Math.round((meters / 1000) * 1000) / 1000);
}

function kilometersToMeters(value: string) {
  const kilometers = emptyNumber(value);
  if (kilometers == null) return null;
  return Math.round(kilometers * 1000 * 100) / 100;
}

/** Exercise blocks follow the selected exercise. Other blocks keep reps and weight. */
function prescriptionParameters(block: BlockDraft, exercises: ExerciseOption[]): TrackingParameter[] | null {
  if (block.blockType !== "exercise") return ["reps", "weight"];
  if (!block.exerciseId) return [];
  return exercises.find((exercise) => exercise.id === block.exerciseId)?.trackingParameters ?? [];
}

function includeParameter(parameters: TrackingParameter[] | null, parameter: TrackingParameter) {
  return parameters?.includes(parameter) ?? false;
}

function showsParameter(block: BlockDraft, exercises: ExerciseOption[], parameter: TrackingParameter) {
  return tracks(prescriptionParameters(block, exercises) ?? [], parameter);
}
