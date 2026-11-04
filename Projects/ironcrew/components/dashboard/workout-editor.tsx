"use client";

import { FormEvent, useState } from "react";

import { DeleteControl, EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import { libraryItemLabel, type ExerciseOption, type LibraryWorkout } from "@/lib/dashboard/load-trainer-programs";
import { tracks, type TrackingParameter } from "@/lib/exercises/tracking";
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

const blankWorkout: LibraryWorkout = {
  id: "new",
  name: "",
  isSystem: false,
  description: null,
  durationMinutes: null,
  blocks: [],
};

export function WorkoutEditor({
  workouts,
  exercises,
  selectedWorkoutId,
  pending,
  creating = false,
  onSelect,
  onDuplicate,
  onSave,
  onCreate,
  onCancelCreate,
  onDelete,
}: {
  workouts: LibraryWorkout[];
  exercises: ExerciseOption[];
  selectedWorkoutId: string | null;
  pending: string | null;
  creating?: boolean;
  onSelect: (workoutId: string) => void;
  onDuplicate: (workoutId: string) => void;
  onSave: (workoutId: string, body: Record<string, unknown>) => Promise<boolean>;
  onCreate?: (body: Record<string, unknown>) => Promise<boolean>;
  onCancelCreate?: () => void;
  onDelete: (workoutId: string) => Promise<boolean>;
}) {
  const requested = workouts.find((workout) => workout.id === selectedWorkoutId) ?? null;
  const selected = creating ? blankWorkout : requested ?? (selectedWorkoutId ? null : workouts[0] ?? null);
  const [name, setName] = useState(selected?.name ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [duration, setDuration] = useState(selected?.durationMinutes == null ? "" : String(selected.durationMinutes));
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (selected ? selected.blocks.map(toDraft) : []));
  const workoutId = selected?.id ?? "";
  const [loadedId, setLoadedId] = useState(workoutId);
  const [baseline, setBaseline] = useState<WorkoutSnapshot>(() => (selected ? workoutSnapshot(selected) : emptyWorkoutSnapshot));
  const { editing, startEditing, stopEditing } = useEditMode(workoutId);
  const editable = creating || (editing && !selected?.isSystem);

  if (workoutId !== loadedId) {
    const next = selected && selected.id !== "new" ? workoutSnapshot(selected) : emptyWorkoutSnapshot;
    setLoadedId(workoutId);
    setName(next.name);
    setDescription(next.description);
    setDuration(next.duration);
    setBlocks(next.blocks);
    setBaseline(next);
  }

  const currentSnapshot: WorkoutSnapshot = { name, description, duration, blocks };
  const dirty = !valuesEqual(currentSnapshot, baseline);

  const cancelEdit = () => {
    setName(baseline.name);
    setDescription(baseline.description);
    setDuration(baseline.duration);
    setBlocks(baseline.blocks);
    stopEditing();
  };

  const workoutBody = () => ({
    name,
    description: description.trim() || null,
    estimated_duration_minutes: duration.trim() === "" ? null : Number(duration),
    blocks: blocks.map((block) => {
      const parameters = prescriptionParameters(block, exercises);
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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) {
      if (!onCreate || !dirty || name.trim().length === 0) return;
      await onCreate(workoutBody());
      return;
    }
    if (!selected || selected.id === "new" || !editing || !dirty) return;
    const nextBaseline: WorkoutSnapshot = { name, description, duration, blocks };
    const saved = await onSave(selected.id, workoutBody());
    if (!saved) return;
    setBaseline(nextBaseline);
    stopEditing();
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
            {creating
              ? "Enter a name here, then add blocks. The workout is saved when you create it."
              : selected?.isSystem
                ? "This system workout is available to everyone. Duplicate it to make your own copy."
                : "Edit sets, reps, and blocks. A duplicate can be changed on its own."}
          </p>
        </div>
        {creating ? null : (
        <button
          type="button"
          disabled={!selected || selected.id === "new" || pending === "duplicate-workout"}
          onClick={() => selected && selected.id !== "new" && onDuplicate(selected.id)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending === "duplicate-workout" ? "Duplicating..." : "Duplicate workout"}
        </button>
        )}
      </div>

      {!creating && workouts.length === 0 ? (
        <p className="text-sm text-slate-500">Create a workout in the Workouts list, then write its blocks here.</p>
      ) : !creating && !selected ? (
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
          {creating ? null : (
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
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Name</span>
              <input required autoFocus={creating} maxLength={160} disabled={!editable} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Minutes</span>
              <input
                type="number"
                min="1"
                step="1"
                disabled={!editable}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-600">Description</span>
              <textarea
                value={description}
                disabled={!editable}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Blocks</h3>
              {selected?.isSystem ? null : (
              <button
                type="button"
                disabled={!editable}
                onClick={() => setBlocks((current) => [...current, emptyBlock(exercises[0]?.id ?? "")])}
                className="text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Add block
              </button>
              )}
            </div>
            {blocks.length === 0 ? <p className="text-sm text-slate-500">No blocks yet.</p> : null}
            <p className="text-xs text-slate-500">Choose an exercise on a block. Create and edit exercises in the Exercises list.</p>
            {blocks.map((block, index) => (
              <div key={block.key} className="space-y-3 rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">Block {index + 1}</span>
                  {selected?.isSystem ? null : (
                  <div className="flex gap-2 text-sm">
                    <button type="button" disabled={!editable || index === 0} onClick={() => moveBlock(index, -1)} className="font-semibold disabled:opacity-40">Up</button>
                    <button type="button" disabled={!editable || index === blocks.length - 1} onClick={() => moveBlock(index, 1)} className="font-semibold disabled:opacity-40">Down</button>
                    <button type="button" disabled={!editable} onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))} className="font-semibold text-red-600 disabled:opacity-40">Remove</button>
                  </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-600">Type</span>
                    <select
                      value={block.blockType}
                      disabled={!editable}
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
                        disabled={!editable}
                        value={block.exerciseId}
                        onChange={(event) => updateBlock(block.key, { exerciseId: event.target.value })}
                        className={fieldClass}
                      >
                        <option value="">Select</option>
                        {exercises.map((exercise) => (
                          <option key={exercise.id} value={exercise.id}>{libraryItemLabel(exercise.name, exercise.isSystem)}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="font-medium text-slate-600">Title</span>
                    <input maxLength={160} disabled={!editable} value={block.title} onChange={(event) => updateBlock(block.key, { title: event.target.value })} className={fieldClass} />
                  </label>
                  <NumberField label="Sets" value={block.sets} disabled={!editable} onChange={(sets) => updateBlock(block.key, { sets })} />
                  {showsParameter(block, exercises, "reps") ? (
                    <>
                      <NumberField label="Reps min" value={block.repsMin} disabled={!editable} onChange={(repsMin) => updateBlock(block.key, { repsMin })} />
                      <NumberField label="Reps max" value={block.repsMax} disabled={!editable} onChange={(repsMax) => updateBlock(block.key, { repsMax })} />
                    </>
                  ) : null}
                  {showsParameter(block, exercises, "weight") ? (
                    <>
                      <NumberField label="Load" value={block.load} disabled={!editable} onChange={(load) => updateBlock(block.key, { load })} step="any" />
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-600">Load unit</span>
                        <input maxLength={20} disabled={!editable} value={block.loadUnit} onChange={(event) => updateBlock(block.key, { loadUnit: event.target.value })} className={fieldClass} />
                      </label>
                    </>
                  ) : null}
                  {showsParameter(block, exercises, "time") ? (
                    <NumberField label="Time (sec)" value={block.durationSeconds} disabled={!editable} onChange={(durationSeconds) => updateBlock(block.key, { durationSeconds })} />
                  ) : null}
                  {showsParameter(block, exercises, "distance") ? (
                    <NumberField label="Distance (km)" value={block.distanceKm} disabled={!editable} onChange={(distanceKm) => updateBlock(block.key, { distanceKm })} step="any" />
                  ) : null}
                  {showsParameter(block, exercises, "height") ? (
                    <NumberField label="Height (cm)" value={block.heightCm} disabled={!editable} onChange={(heightCm) => updateBlock(block.key, { heightCm })} step="any" />
                  ) : null}
                  <NumberField label="Rest seconds" value={block.restSeconds} disabled={!editable} onChange={(restSeconds) => updateBlock(block.key, { restSeconds })} />
                </div>
              </div>
            ))}
          </div>

          {selected?.isSystem ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <EditSaveActions
              editing={editable}
              dirty={dirty && name.trim().length > 0}
              pending={pending === (creating ? "create-workout" : "save-workout")}
              saveLabel={creating ? "Create workout" : "Save workout"}
              pendingLabel={creating ? "Creating..." : "Saving..."}
              saveClassName="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              editClassName="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onEdit={startEditing}
              onCancel={() => {
                if (creating) {
                  onCancelCreate?.();
                  return;
                }
                cancelEdit();
              }}
            />
            {creating || !selected || selected.id === "new" ? null : (
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
            )}
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
