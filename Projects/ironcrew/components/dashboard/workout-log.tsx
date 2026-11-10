"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import { muscleGroupLabel, type ClientExercise, type ClientLoggedSet, type ClientWorkout } from "@/lib/dashboard/client-week";
import {
  draftSets,
  fieldsFromCoach,
  fieldsFromLog,
  MAX_PREFILL_SETS,
  type SetDraft,
  type SetFields,
} from "@/lib/dashboard/workout-prefill";
import { tracks, type TrackingParameter } from "@/lib/exercises/tracking";

type DraftSet = SetDraft;

type DraftBlock = {
  id: string;
  name: string;
  detail: string | null;
  muscleGroups: string | null;
  parameters: TrackingParameter[];
  trainer: SetFields;
  fallbackUnit: string | null;
  previousSets: ClientLoggedSet[];
  sets: DraftSet[];
};

const MAX_SETS = MAX_PREFILL_SETS;

export function WorkoutLog({
  workout,
  onLogged,
}: {
  workout: ClientWorkout;
  onLogged?: (status: string) => void;
}) {
  const router = useRouter();
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [note, setNote] = useState(workout.sessionNote ?? "");
  const [noteBaseline, setNoteBaseline] = useState(workout.sessionNote ?? "");
  const { editing: editingNote, startEditing: startNoteEdit, stopEditing: stopNoteEdit } = useEditMode(workout.id);
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => workout.exercises.map(draftBlock));
  const [setBaselines, setSetBaselines] = useState<Record<string, DraftSet[]>>(() => baselineSetsFrom(workout.exercises.map(draftBlock)));
  const [loadedWorkoutId, setLoadedWorkoutId] = useState(workout.id);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [errorByBlock, setErrorByBlock] = useState<Record<string, string>>({});

  if (workout.id !== loadedWorkoutId) {
    const nextBlocks = workout.exercises.map(draftBlock);
    setLoadedWorkoutId(workout.id);
    setNote(workout.sessionNote ?? "");
    setNoteBaseline(workout.sessionNote ?? "");
    setBlocks(nextBlocks);
    setSetBaselines(baselineSetsFrom(nextBlocks));
    setOpenBlockId(null);
  }

  const save = (blockId: string) => {
    const block = blocks.find((item) => item.id === blockId);
    const blockDirty = block ? !valuesEqual(block.sets, setBaselines[block.id] ?? block.sets) : false;
    if (blockId === "note") {
      if (!editingNote || note === noteBaseline) return;
    } else if (!blockDirty) {
      return;
    }
    const payload = buildPayload(note, blocks);
    if ("error" in payload) {
      setErrorByBlock((current) => ({ ...current, [blockId]: payload.error }));
      return;
    }

    setPendingBlockId(blockId);
    setErrorByBlock((current) => {
      const rest = { ...current };
      delete rest[blockId];
      return rest;
    });
    void fetch(`/api/workout-assignments/${workout.id}/log`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Couldn't save these details");
        setNoteBaseline(note);
        setSetBaselines(baselineSetsFrom(blocks));
        stopNoteEdit();
        if (body?.status) onLogged?.(body.status);
        router.refresh();
      })
      .catch((caught: unknown) => {
        setErrorByBlock((current) => ({
          ...current,
          [blockId]: caught instanceof Error ? caught.message : "Couldn't save these details",
        }));
      })
      .finally(() => setPendingBlockId((current) => (current === blockId ? null : current)));
  };

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Workout note
          <textarea
            value={note}
            disabled={!editingNote}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={10000}
            placeholder="How did this session go?"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
        <EditSaveActions
          className="mt-2 flex flex-wrap items-center gap-2"
          editing={editingNote}
          dirty={note !== noteBaseline}
          pending={pendingBlockId === "note"}
          saveLabel="Save note"
          pendingLabel="Saving…"
          saveType="button"
          onSave={() => save("note")}
          saveClassName="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          editClassName="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          onEdit={startNoteEdit}
          onCancel={() => {
            setNote(noteBaseline);
            stopNoteEdit();
          }}
        />
        {errorByBlock.note && <p className="mt-2 text-sm text-red-600">{errorByBlock.note}</p>}
      </div>

      {blocks.length === 0 ? (
        <p className="text-sm text-slate-500">No blocks listed for this workout.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {blocks.map((block, blockIndex) => {
            const open = openBlockId === block.id;
            const saved = blockHasSavedSets(workout, block.id);
            const pending = pendingBlockId === block.id;
            const blockDirty = !valuesEqual(block.sets, setBaselines[block.id] ?? block.sets);
            return (
              <li key={block.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {blockIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{block.name}</p>
                      {block.muscleGroups ? <p className="text-xs text-slate-500">{block.muscleGroups}</p> : null}
                      {block.detail && <p className="text-xs text-slate-500">{block.detail}</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenBlockId(open ? null : block.id)}
                    className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {open ? "Hide details" : saved ? "Edit details" : "Add details"}
                  </button>
                </div>

                {open && (
                  <form
                    className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      save(block.id);
                    }}
                  >
                    {block.sets.map((set, index) => (
                      <div key={`${block.id}-${index}`} className="space-y-2 rounded-lg bg-white p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-600">Set {index + 1}</p>
                          <button
                            type="button"
                            disabled={block.sets.length === 1}
                            onClick={() => removeSet(block.id, index)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </div>
                        <ValueRow title="Trainer" values={set.trainer} parameters={block.parameters} disabled />
                        <ValueRow title="Previous" values={set.previous} parameters={block.parameters} disabled />
                        <ValueRow
                          title="This workout"
                          values={set.current}
                          parameters={block.parameters}
                          disabled={false}
                          onChange={(patch) => updateSet(block.id, index, patch)}
                        />
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={block.sets.length >= MAX_SETS}
                        onClick={() => addSet(block.id)}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-950 disabled:opacity-40"
                      >
                        Add set
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setBlocks((current) =>
                            current.map((item) =>
                              item.id === block.id
                                ? { ...item, sets: (setBaselines[block.id] ?? item.sets).map((set) => ({ ...set })) }
                                : item,
                            ),
                          );
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!blockDirty || pending}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {pending ? "Saving…" : "Save details"}
                      </button>
                    </div>
                    {errorByBlock[block.id] && <p className="text-sm text-red-600">{errorByBlock[block.id]}</p>}
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  function updateSet(blockId: string, index: number, patch: Partial<SetFields>) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              sets: block.sets.map((set, setIndex) =>
                setIndex === index ? { ...set, current: { ...set.current, ...patch } } : set,
              ),
            }
          : block,
      ),
    );
  }

  function addSet(blockId: string) {
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId || block.sets.length >= MAX_SETS) return block;
        const setNumber = block.sets.length + 1;
        const previous = block.previousSets.find((set) => set.setNumber === setNumber);
        return {
          ...block,
          sets: [
            ...block.sets,
            {
              trainer: block.trainer,
              previous: fieldsFromLog(previous, block.fallbackUnit),
              current: fieldsFromLog(undefined, block.fallbackUnit),
            },
          ],
        };
      }),
    );
  }

  function removeSet(blockId: string, index: number) {
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId || block.sets.length === 1) return block;
        return { ...block, sets: block.sets.filter((_, setIndex) => setIndex !== index) };
      }),
    );
  }
}

function baselineSetsFrom(drafts: DraftBlock[]) {
  return Object.fromEntries(drafts.map((block) => [block.id, block.sets.map((set) => ({ ...set }))]));
}

function blockHasSavedSets(workout: ClientWorkout, blockId: string) {
  return workout.exercises.some((exercise) => exercise.id === blockId && exercise.sets.length > 0);
}

function draftBlock(exercise: ClientExercise): DraftBlock {
  return {
    id: exercise.id,
    name: exercise.name,
    detail: exercise.detail,
    muscleGroups: muscleGroupLabel(exercise.primaryMuscleGroup, exercise.secondaryMuscleGroup),
    parameters: exercise.trackingParameters,
    trainer: fieldsFromCoach(exercise),
    fallbackUnit: exercise.loadUnit,
    previousSets: exercise.previousSets,
    sets: draftSets(exercise),
  };
}

function buildPayload(note: string, blocks: DraftBlock[]): { error: string } | {
  note: string | null;
  blocks: {
    block_id: string;
    sets: {
      set_number: number;
      repetitions: number | null;
      load: number | null;
      load_unit: "kg" | "lb";
      duration_seconds: number | null;
      distance_meters: number | null;
      height_cm: number | null;
      notes: string | null;
    }[];
  }[];
} {
  const parsedBlocks = [];
  for (const block of blocks) {
    const sets = [];
    for (const [index, set] of block.sets.entries()) {
      const current = set.current;
      const repetitions = parseWholeNumber(current.repetitions);
      const durationSeconds = parseWholeNumber(current.durationSeconds);
      const load = parseLoad(current.load);
      const distanceKm = parseLoad(current.distanceKm);
      const heightCm = parseLoad(current.heightCm);
      if (
        repetitions === undefined ||
        durationSeconds === undefined ||
        load === undefined ||
        distanceKm === undefined ||
        heightCm === undefined
      ) {
        return { error: "Use whole numbers for reps and time, and a weight, distance, or height that is zero or greater." };
      }
      sets.push({
        set_number: index + 1,
        repetitions,
        load,
        load_unit: current.loadUnit,
        duration_seconds: durationSeconds,
        distance_meters: distanceKm == null ? null : Math.round(distanceKm * 1000 * 100) / 100,
        height_cm: heightCm,
        notes: null,
      });
    }
    parsedBlocks.push({ block_id: block.id, sets });
  }

  return { note: note.trim() || null, blocks: parsedBlocks };
}

function parseWholeNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

function parseLoad(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

function ValueRow({
  title,
  values,
  parameters,
  disabled,
  onChange,
}: {
  title: string;
  values: SetFields;
  parameters: TrackingParameter[];
  disabled: boolean;
  onChange?: (patch: Partial<SetFields>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <span className="w-28 shrink-0 self-end pb-2 text-[11px] font-semibold whitespace-nowrap text-slate-500">{title}</span>
      {tracks(parameters, "weight") ? (
        <>
          <Field label="Weight" className="w-24">
            <input
              type="text"
              inputMode="decimal"
              disabled={disabled}
              readOnly={disabled}
              value={values.load}
              onChange={(event) => onChange?.({ load: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="Unit" className="w-20">
            <select
              disabled={disabled}
              value={values.loadUnit}
              onChange={(event) => onChange?.({ loadUnit: event.target.value === "lb" ? "lb" : "kg" })}
              className={fieldClass}
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </Field>
        </>
      ) : null}
      {tracks(parameters, "reps") ? (
        <Field label="Reps" className="w-20">
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            readOnly={disabled}
            value={values.repetitions}
            onChange={(event) => onChange?.({ repetitions: event.target.value })}
            className={fieldClass}
          />
        </Field>
      ) : null}
      {tracks(parameters, "time") ? (
        <Field label="Time (sec)" className="w-24">
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            readOnly={disabled}
            value={values.durationSeconds}
            onChange={(event) => onChange?.({ durationSeconds: event.target.value })}
            className={fieldClass}
          />
        </Field>
      ) : null}
      {tracks(parameters, "distance") ? (
        <Field label="Distance (km)" className="w-28">
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            readOnly={disabled}
            value={values.distanceKm}
            onChange={(event) => onChange?.({ distanceKm: event.target.value })}
            className={fieldClass}
          />
        </Field>
      ) : null}
      {tracks(parameters, "height") ? (
        <Field label="Height (cm)" className="w-24">
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            readOnly={disabled}
            value={values.heightCm}
            onChange={(event) => onChange?.({ heightCm: event.target.value })}
            className={fieldClass}
          />
        </Field>
      ) : null}
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-[11px] font-medium text-slate-500 ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}

const fieldClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50";
