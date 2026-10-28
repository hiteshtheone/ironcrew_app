"use client";

import { FormEvent, useEffect, useState } from "react";

import { DeleteControl, EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import type { ExerciseOption, LibraryWorkout } from "@/lib/dashboard/load-trainer-programs";
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
  onCreateExercise: (name: string) => Promise<ExerciseOption | null>;
}) {
  const requested = workouts.find((workout) => workout.id === selectedWorkoutId) ?? null;
  const selected = requested ?? (selectedWorkoutId ? null : workouts[0] ?? null);
  const [name, setName] = useState(selected?.name ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [duration, setDuration] = useState(selected?.durationMinutes == null ? "" : String(selected.durationMinutes));
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (selected ? selected.blocks.map(toDraft) : []));
  const [exerciseName, setExerciseName] = useState("");
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
      return [...exercises, ...pendingExercises].sort((left, right) => left.name.localeCompare(right.name));
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
      blocks: blocks.map((block) => ({
        block_type: block.blockType,
        exercise_id: block.blockType === "exercise" ? block.exerciseId || null : null,
        title: block.title.trim() || null,
        prescribed_sets: emptyNumber(block.sets),
        prescribed_reps_min: emptyNumber(block.repsMin),
        prescribed_reps_max: emptyNumber(block.repsMax),
        prescribed_load: emptyNumber(block.load),
        load_unit: block.loadUnit.trim() || null,
        rest_seconds: emptyNumber(block.restSeconds),
      })),
    });
    if (!saved) return;
    setBaseline(nextBaseline);
    stopEditing();
  };

  const createExercise = () => {
    void onCreateExercise(exerciseName).then((created) => {
      if (!created) return;
      setKnownExercises((current) =>
        current.some((exercise) => exercise.id === created.id)
          ? current
          : [...current, created].sort((left, right) => left.name.localeCompare(right.name)),
      );
      setExerciseName("");
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
          <p className="mt-1 text-sm text-slate-500">Edit sets, reps, and blocks. A duplicate can be changed on its own.</p>
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
        <p className="text-sm text-slate-500">Add a workout from a week, then come back here to write its blocks.</p>
      ) : !selected ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Opening this workout...</p>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Library workout</span>
            <select value="" onChange={(event) => onSelect(event.target.value)} className={fieldClass}>
              <option value="">Select</option>
              {workouts.map((workout) => (
                <option key={workout.id} value={workout.id}>{workout.name}</option>
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
                <option key={workout.id} value={workout.id}>{workout.name}</option>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Blocks</h3>
              <button
                type="button"
                disabled={!editing}
                onClick={() => setBlocks((current) => [...current, emptyBlock(knownExercises[0]?.id ?? "")])}
                className="text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Add block
              </button>
            </div>
            {blocks.length === 0 ? <p className="text-sm text-slate-500">No blocks yet.</p> : null}
            {blocks.map((block, index) => (
              <div key={block.key} className="space-y-3 rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">Block {index + 1}</span>
                  <div className="flex gap-2 text-sm">
                    <button type="button" disabled={!editing || index === 0} onClick={() => moveBlock(index, -1)} className="font-semibold disabled:opacity-40">Up</button>
                    <button type="button" disabled={!editing || index === blocks.length - 1} onClick={() => moveBlock(index, 1)} className="font-semibold disabled:opacity-40">Down</button>
                    <button type="button" disabled={!editing} onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))} className="font-semibold text-red-600 disabled:opacity-40">Remove</button>
                  </div>
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
                          <option key={exercise.id} value={exercise.id}>{exercise.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="font-medium text-slate-600">Title</span>
                    <input maxLength={160} disabled={!editing} value={block.title} onChange={(event) => updateBlock(block.key, { title: event.target.value })} className={fieldClass} />
                  </label>
                  <NumberField label="Sets" value={block.sets} disabled={!editing} onChange={(sets) => updateBlock(block.key, { sets })} />
                  <NumberField label="Reps min" value={block.repsMin} disabled={!editing} onChange={(repsMin) => updateBlock(block.key, { repsMin })} />
                  <NumberField label="Reps max" value={block.repsMax} disabled={!editing} onChange={(repsMax) => updateBlock(block.key, { repsMax })} />
                  <NumberField label="Load" value={block.load} disabled={!editing} onChange={(load) => updateBlock(block.key, { load })} step="any" />
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-600">Load unit</span>
                    <input maxLength={20} disabled={!editing} value={block.loadUnit} onChange={(event) => updateBlock(block.key, { loadUnit: event.target.value })} className={fieldClass} />
                  </label>
                  <NumberField label="Rest seconds" value={block.restSeconds} disabled={!editing} onChange={(restSeconds) => updateBlock(block.key, { restSeconds })} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-end">
            <label className="grid flex-1 gap-1 text-sm">
              <span className="font-medium text-slate-600">New exercise</span>
              <input
                value={exerciseName}
                onChange={(event) => setExerciseName(event.target.value)}
                maxLength={160}
                placeholder="Exercise name"
                className={fieldClass}
              />
            </label>
            <button
              type="button"
              disabled={pending === "exercise" || exerciseName.trim().length === 0}
              onClick={createExercise}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {pending === "exercise" ? "Adding..." : "Add exercise"}
            </button>
          </div>

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
  };
}

function emptyNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
