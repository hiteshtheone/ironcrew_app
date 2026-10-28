"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import type { ClientExercise, ClientLoggedSet, ClientWorkout } from "@/lib/dashboard/client-week";

type DraftSet = {
  repetitions: string;
  load: string;
  loadUnit: "kg" | "lb";
  durationSeconds: string;
  distanceKm: string;
  notes: string;
};

type DraftBlock = {
  id: string;
  name: string;
  detail: string | null;
  sets: DraftSet[];
};

const MAX_SETS = 20;

export function WorkoutLog({ workout }: { workout: ClientWorkout }) {
  const router = useRouter();
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [note, setNote] = useState(workout.sessionNote ?? "");
  const [noteBaseline, setNoteBaseline] = useState(workout.sessionNote ?? "");
  const { editing: editingNote, startEditing: startNoteEdit, stopEditing: stopNoteEdit } = useEditMode(workout.id);
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => workout.exercises.map(draftBlock));
  const [setBaselines, setSetBaselines] = useState<Record<string, DraftSet[]>>(() => baselineSetsFrom(workout.exercises.map(draftBlock)));
  const [editingBlocks, setEditingBlocks] = useState<Record<string, boolean>>({});
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
    setEditingBlocks({});
  }

  const save = (blockId: string) => {
    const block = blocks.find((item) => item.id === blockId);
    const blockDirty = block ? !valuesEqual(block.sets, setBaselines[block.id] ?? block.sets) : false;
    if (blockId === "note") {
      if (!editingNote || note === noteBaseline) return;
    } else if (!editingBlocks[blockId] || !blockDirty) {
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
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Couldn't save these details");
        setNoteBaseline(note);
        setSetBaselines(baselineSetsFrom(blocks));
        stopNoteEdit();
        setEditingBlocks({});
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
            const blockEditing = Boolean(editingBlocks[block.id]);
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
                      <div key={`${block.id}-${index}`} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-[5.5rem_4.5rem_4.5rem_5.5rem_6.5rem_minmax(0,1fr)_auto]">
                        <Field label={index === 0 ? "Weight" : `Weight, set ${index + 1}`}>
                          <input
                            inputMode="decimal"
                            disabled={!blockEditing}
                            value={set.load}
                            onChange={(event) => updateSet(block.id, index, { load: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label={index === 0 ? "Unit" : `Unit, set ${index + 1}`}>
                          <select
                            value={set.loadUnit}
                            disabled={!blockEditing}
                            onChange={(event) =>
                              updateSet(block.id, index, { loadUnit: event.target.value === "lb" ? "lb" : "kg" })
                            }
                            className={fieldClass}
                          >
                            <option value="kg">kg</option>
                            <option value="lb">lb</option>
                          </select>
                        </Field>
                        <Field label={index === 0 ? "Reps" : `Reps, set ${index + 1}`}>
                          <input
                            inputMode="numeric"
                            disabled={!blockEditing}
                            value={set.repetitions}
                            onChange={(event) => updateSet(block.id, index, { repetitions: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label={index === 0 ? "Time (sec)" : `Time, set ${index + 1}`}>
                          <input
                            inputMode="numeric"
                            disabled={!blockEditing}
                            value={set.durationSeconds}
                            onChange={(event) => updateSet(block.id, index, { durationSeconds: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label={index === 0 ? "Distance (km)" : `Distance, set ${index + 1}`}>
                          <input
                            inputMode="decimal"
                            disabled={!blockEditing}
                            value={set.distanceKm}
                            onChange={(event) => updateSet(block.id, index, { distanceKm: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label={index === 0 ? "Note" : `Note, set ${index + 1}`}>
                          <input
                            value={set.notes}
                            maxLength={1000}
                            disabled={!blockEditing}
                            onChange={(event) => updateSet(block.id, index, { notes: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <button
                          type="button"
                          disabled={!blockEditing || block.sets.length === 1}
                          onClick={() => removeSet(block.id, index)}
                          className="self-end rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={!blockEditing || block.sets.length >= MAX_SETS}
                        onClick={() => addSet(block.id)}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-950 disabled:opacity-40"
                      >
                        Add set
                      </button>
                      <EditSaveActions
                        editing={blockEditing}
                        dirty={blockDirty}
                        pending={pending}
                        saveLabel="Save details"
                        pendingLabel="Saving…"
                        saveClassName="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        editClassName="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        onEdit={() => setEditingBlocks((current) => ({ ...current, [block.id]: true }))}
                        onCancel={() => {
                          setBlocks((current) =>
                            current.map((item) =>
                              item.id === block.id
                                ? { ...item, sets: (setBaselines[block.id] ?? item.sets).map((set) => ({ ...set })) }
                                : item,
                            ),
                          );
                          setEditingBlocks((current) => ({ ...current, [block.id]: false }));
                        }}
                      />
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

  function updateSet(blockId: string, index: number, patch: Partial<DraftSet>) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              sets: block.sets.map((set, setIndex) => (setIndex === index ? { ...set, ...patch } : set)),
            }
          : block,
      ),
    );
  }

  function addSet(blockId: string) {
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId || block.sets.length >= MAX_SETS) return block;
        const unit = block.sets[0]?.loadUnit ?? "kg";
        return { ...block, sets: [...block.sets, emptySet(unit)] };
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
  const unit = loadUnitOrDefault(exercise.loadUnit);
  const saved = new Map(exercise.sets.map((set) => [set.setNumber, set]));
  const count = Math.min(
    MAX_SETS,
    Math.max(exercise.prescribedSets ?? 1, ...exercise.sets.map((set) => set.setNumber), 1),
  );

  return {
    id: exercise.id,
    name: exercise.name,
    detail: exercise.detail,
    sets: Array.from({ length: count }, (_, index) => draftSet(saved.get(index + 1), unit)),
  };
}

function draftSet(set: ClientLoggedSet | undefined, unit: "kg" | "lb"): DraftSet {
  if (!set) return emptySet(unit);
  return {
    repetitions: set.repetitions == null ? "" : String(set.repetitions),
    load: set.load == null ? "" : String(set.load),
    loadUnit: loadUnitOrDefault(set.loadUnit ?? unit),
    durationSeconds: set.durationSeconds == null ? "" : String(set.durationSeconds),
    distanceKm: metersToKm(set.distanceMeters),
    notes: set.notes ?? "",
  };
}

function emptySet(loadUnit: "kg" | "lb"): DraftSet {
  return { repetitions: "", load: "", loadUnit, durationSeconds: "", distanceKm: "", notes: "" };
}

function metersToKm(meters: number | null) {
  if (meters == null) return "";
  return String(Math.round((meters / 1000) * 1000) / 1000);
}

function loadUnitOrDefault(unit: string | null): "kg" | "lb" {
  const normalized = unit?.trim().toLowerCase();
  if (normalized === "lb" || normalized === "lbs") return "lb";
  return "kg";
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
      notes: string | null;
    }[];
  }[];
} {
  const parsedBlocks = [];
  for (const block of blocks) {
    const sets = [];
    for (const [index, set] of block.sets.entries()) {
      const repetitions = parseWholeNumber(set.repetitions);
      const durationSeconds = parseWholeNumber(set.durationSeconds);
      const load = parseLoad(set.load);
      const distanceKm = parseLoad(set.distanceKm);
      if (repetitions === undefined || durationSeconds === undefined || load === undefined || distanceKm === undefined) {
        return { error: "Use whole numbers for reps and time, and a weight or distance that is zero or greater." };
      }
      sets.push({
        set_number: index + 1,
        repetitions,
        load,
        load_unit: set.loadUnit,
        duration_seconds: durationSeconds,
        distance_meters: distanceKm == null ? null : Math.round(distanceKm * 1000 * 100) / 100,
        notes: set.notes.trim() || null,
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-slate-500">
      {label}
      {children}
    </label>
  );
}

const fieldClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50";
