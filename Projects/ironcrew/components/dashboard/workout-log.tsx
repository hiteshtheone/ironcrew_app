"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import { ExerciseDetailsButton } from "@/components/dashboard/exercise-instructions";
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
  instructions: string | null;
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
  const [calories, setCalories] = useState(() => wholeNumberText(workout.calories));
  const [caloriesBaseline, setCaloriesBaseline] = useState(() => wholeNumberText(workout.calories));
  const [heartRate, setHeartRate] = useState(() => wholeNumberText(workout.heartRateBpm));
  const [heartRateBaseline, setHeartRateBaseline] = useState(() => wholeNumberText(workout.heartRateBpm));
  const { editing: editingNote, startEditing: startNoteEdit, stopEditing: stopNoteEdit } = useEditMode(workout.id);
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => workout.exercises.map(draftBlock));
  const [setBaselines, setSetBaselines] = useState<Record<string, DraftSet[]>>(() => baselineSetsFrom(workout.exercises.map(draftBlock)));
  const [loadedWorkoutId, setLoadedWorkoutId] = useState(workout.id);
  const [pendingNote, setPendingNote] = useState(false);
  const [savingBlockIds, setSavingBlockIds] = useState<string[]>([]);
  const [errorByBlock, setErrorByBlock] = useState<Record<string, string>>({});
  const blocksRef = useRef(blocks);
  const baselinesRef = useRef(setBaselines);
  const sessionRef = useRef({
    note,
    noteBaseline,
    calories,
    caloriesBaseline,
    heartRate,
    heartRateBaseline,
  });
  const assignmentIdRef = useRef(workout.id);
  const saveQueue = useRef({ running: false, follow: null as SaveKind | null, focusId: null as string | null });
  assignmentIdRef.current = workout.id;

  if (workout.id !== loadedWorkoutId) {
    const nextBlocks = workout.exercises.map(draftBlock);
    const nextNote = workout.sessionNote ?? "";
    const nextCalories = wholeNumberText(workout.calories);
    const nextHeartRate = wholeNumberText(workout.heartRateBpm);
    blocksRef.current = nextBlocks;
    baselinesRef.current = baselineSetsFrom(nextBlocks);
    sessionRef.current = {
      note: nextNote,
      noteBaseline: nextNote,
      calories: nextCalories,
      caloriesBaseline: nextCalories,
      heartRate: nextHeartRate,
      heartRateBaseline: nextHeartRate,
    };
    saveQueue.current = { running: false, follow: null, focusId: null };
    setLoadedWorkoutId(workout.id);
    setNote(nextNote);
    setNoteBaseline(nextNote);
    setCalories(nextCalories);
    setCaloriesBaseline(nextCalories);
    setHeartRate(nextHeartRate);
    setHeartRateBaseline(nextHeartRate);
    setBlocks(nextBlocks);
    setSetBaselines(baselinesRef.current);
    setOpenBlockId(null);
    setPendingNote(false);
    setSavingBlockIds([]);
    setErrorByBlock({});
  }

  const changeNote = (value: string) => {
    sessionRef.current = { ...sessionRef.current, note: value };
    setNote(value);
  };
  const changeCalories = (value: string) => {
    sessionRef.current = { ...sessionRef.current, calories: value };
    setCalories(value);
  };
  const changeHeartRate = (value: string) => {
    sessionRef.current = { ...sessionRef.current, heartRate: value };
    setHeartRate(value);
  };

  const requestNoteSave = () => {
    if (!editingNote || !sessionIsDirty(sessionRef.current)) return;
    setPendingNote(true);
    enqueue("note", null);
  };

  const requestBlockSave = (blockId: string) => {
    if (!blockIsDirty(blockId, blocksRef.current, baselinesRef.current)) return;
    setSavingBlockIds((current) => (current.includes(blockId) ? current : [...current, blockId]));
    enqueue("blocks", blockId);
  };

  function enqueue(kind: SaveKind, focusId: string | null) {
    if (saveQueue.current.running) {
      saveQueue.current.follow = saveQueue.current.follow === "note" || kind === "note" ? "note" : "blocks";
      if (focusId) saveQueue.current.focusId = focusId;
      return;
    }
    void runSave(kind, focusId);
  }

  async function runSave(kind: SaveKind, focusId: string | null) {
    const startedFor = assignmentIdRef.current;
    saveQueue.current.running = true;
    saveQueue.current.follow = null;
    saveQueue.current.focusId = null;
    const session = sessionRef.current;
    const includeSession = kind === "note";
    const noteValue = includeSession ? session.note : session.noteBaseline;
    const caloriesValue = includeSession ? session.calories : session.caloriesBaseline;
    const heartRateValue = includeSession ? session.heartRate : session.heartRateBaseline;
    const prepared = blocksToSave(blocksRef.current, baselinesRef.current, kind, focusId);
    if ("error" in prepared) {
      if (assignmentIdRef.current === startedFor) {
        setErrorByBlock((current) => ({ ...current, [prepared.blockId]: prepared.error }));
      }
      finishSave(startedFor, false);
      return;
    }

    const payload = buildPayload(noteValue, caloriesValue, heartRateValue, prepared.blocks);
    if ("error" in payload) {
      if (assignmentIdRef.current === startedFor) {
        const key = payload.session ? "note" : payload.blockId ?? focusId ?? "note";
        setErrorByBlock((current) => ({ ...current, [key]: payload.error }));
      }
      finishSave(startedFor, false);
      return;
    }

    if (assignmentIdRef.current === startedFor) {
      setErrorByBlock((current) => {
        const next = { ...current };
        if (includeSession) delete next.note;
        for (const block of prepared.blocks) {
          const live = blocksRef.current.find((item) => item.id === block.id);
          if (live && valuesEqual(live.sets, block.sets)) delete next[block.id];
        }
        return next;
      });
    }

    try {
      const response = await fetch(`/api/workout-assignments/${startedFor}/log`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
      if (assignmentIdRef.current !== startedFor) return;
      if (!response.ok) throw new Error(body?.error || "Couldn't save these details");
      const savedBaselines = baselineSetsFrom(prepared.blocks);
      baselinesRef.current = { ...baselinesRef.current, ...savedBaselines };
      setSetBaselines(baselinesRef.current);
      if (includeSession) {
        sessionRef.current = {
          ...sessionRef.current,
          noteBaseline: noteValue,
          caloriesBaseline: caloriesValue,
          heartRateBaseline: heartRateValue,
        };
        setNoteBaseline(noteValue);
        setCaloriesBaseline(caloriesValue);
        setHeartRateBaseline(heartRateValue);
        stopNoteEdit();
      }
      if (body?.status) onLogged?.(body.status);
      router.refresh();
      finishSave(startedFor, true);
    } catch (caught: unknown) {
      if (assignmentIdRef.current !== startedFor) return;
      const message = caught instanceof Error ? caught.message : "Couldn't save these details";
      const key = focusId ?? "note";
      setErrorByBlock((current) => ({ ...current, [key]: message }));
      finishSave(startedFor, true);
    }
  }

  function firstDirtyBlockId() {
    return blocksRef.current.find((block) => blockIsDirty(block.id, blocksRef.current, baselinesRef.current))?.id ?? null;
  }

  function finishSave(startedFor: string, allowFollowUp: boolean) {
    if (assignmentIdRef.current !== startedFor) return;
    const follow = allowFollowUp ? saveQueue.current.follow : null;
    const focusId = saveQueue.current.focusId;
    saveQueue.current.follow = null;
    saveQueue.current.focusId = null;
    saveQueue.current.running = false;
    if (follow === "note" && (sessionIsDirty(sessionRef.current) || firstDirtyBlockId())) {
      void runSave("note", focusId);
      return;
    }
    if (follow === "blocks") {
      const nextId = focusId && blockIsDirty(focusId, blocksRef.current, baselinesRef.current) ? focusId : firstDirtyBlockId();
      if (nextId) {
        void runSave("blocks", nextId);
        return;
      }
    }
    setPendingNote(false);
    setSavingBlockIds([]);
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Workout note
          <textarea
            value={note}
            disabled={!editingNote}
            onChange={(event) => changeNote(event.target.value)}
            rows={2}
            maxLength={10000}
            placeholder="How did this session go?"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Calories
            <input
              type="text"
              inputMode="numeric"
              value={calories}
              disabled={!editingNote}
              onChange={(event) => changeCalories(event.target.value)}
              placeholder="Optional"
              className="mt-1 w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Heart rate (bpm)
            <input
              type="text"
              inputMode="numeric"
              value={heartRate}
              disabled={!editingNote}
              onChange={(event) => changeHeartRate(event.target.value)}
              placeholder="Optional"
              className="mt-1 w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </label>
        </div>
        <EditSaveActions
          className="mt-2 flex flex-wrap items-center gap-2"
          editing={editingNote}
          dirty={note !== noteBaseline || calories !== caloriesBaseline || heartRate !== heartRateBaseline}
          pending={pendingNote}
          saveLabel="Save"
          pendingLabel="Saving…"
          saveType="button"
          onSave={requestNoteSave}
          saveClassName="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          editClassName="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          onEdit={startNoteEdit}
          onCancel={() => {
            const session = sessionRef.current;
            sessionRef.current = {
              ...session,
              note: session.noteBaseline,
              calories: session.caloriesBaseline,
              heartRate: session.heartRateBaseline,
            };
            setNote(session.noteBaseline);
            setCalories(session.caloriesBaseline);
            setHeartRate(session.heartRateBaseline);
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
            const saving = savingBlockIds.includes(block.id);
            return (
              <li key={block.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {blockIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{block.name}</p>
                        <ExerciseDetailsButton name={block.name} instructions={block.instructions} />
                      </div>
                      {block.muscleGroups ? <p className="text-xs text-slate-500">{block.muscleGroups}</p> : null}
                      {block.detail && <p className="text-xs text-slate-500">{block.detail}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {saving ? <span className="text-xs font-semibold text-slate-500">Saving…</span> : null}
                    <button
                      type="button"
                      onClick={() => setOpenBlockId(open ? null : block.id)}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {open ? "Hide" : "Log"}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
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
                          onChange={(patch) => updateSet(block.id, index, patch, false)}
                          onCommit={(patch) => updateSet(block.id, index, patch, true)}
                          onBlur={() => requestBlockSave(block.id)}
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
                    </div>
                  </div>
                )}
                {errorByBlock[block.id] ? <p className="mt-2 text-sm text-red-600">{errorByBlock[block.id]}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  function updateSet(blockId: string, index: number, patch: Partial<SetFields>, commit: boolean) {
    const next = blocksRef.current.map((block) =>
      block.id === blockId
        ? {
            ...block,
            sets: block.sets.map((set, setIndex) =>
              setIndex === index ? { ...set, current: { ...set.current, ...patch } } : set,
            ),
          }
        : block,
    );
    blocksRef.current = next;
    setBlocks(next);
    if (commit) requestBlockSave(blockId);
  }

  function addSet(blockId: string) {
    const next = blocksRef.current.map((block) => {
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
    });
    blocksRef.current = next;
    setBlocks(next);
    requestBlockSave(blockId);
  }

  function removeSet(blockId: string, index: number) {
    const next = blocksRef.current.map((block) => {
      if (block.id !== blockId || block.sets.length === 1) return block;
      return { ...block, sets: block.sets.filter((_, setIndex) => setIndex !== index) };
    });
    blocksRef.current = next;
    setBlocks(next);
    requestBlockSave(blockId);
  }
}

type SaveKind = "note" | "blocks";

type SessionDraft = {
  note: string;
  noteBaseline: string;
  calories: string;
  caloriesBaseline: string;
  heartRate: string;
  heartRateBaseline: string;
};

function baselineSetsFrom(drafts: DraftBlock[]) {
  return Object.fromEntries(drafts.map((block) => [block.id, block.sets.map((set) => ({ ...set, current: { ...set.current } }))]));
}

function sessionIsDirty(session: SessionDraft) {
  return (
    session.note !== session.noteBaseline ||
    session.calories !== session.caloriesBaseline ||
    session.heartRate !== session.heartRateBaseline
  );
}

function blockIsDirty(blockId: string, blocks: DraftBlock[], baselines: Record<string, DraftSet[]>) {
  const block = blocks.find((item) => item.id === blockId);
  if (!block) return false;
  return !valuesEqual(block.sets, baselines[blockId] ?? block.sets);
}

function blocksToSave(
  live: DraftBlock[],
  baselines: Record<string, DraftSet[]>,
  kind: SaveKind,
  focusId: string | null,
): { blocks: DraftBlock[] } | { error: string; blockId: string } {
  const blocks: DraftBlock[] = [];
  for (const block of live) {
    const parsed = buildPayload("", "", "", [block]);
    if (!("error" in parsed)) {
      blocks.push(block);
      continue;
    }
    if (kind === "note" || block.id === focusId) return { error: parsed.error, blockId: block.id };
    blocks.push({ ...block, sets: baselines[block.id] ?? block.sets });
  }
  return { blocks };
}

function draftBlock(exercise: ClientExercise): DraftBlock {
  return {
    id: exercise.id,
    name: exercise.name,
    instructions: exercise.instructions,
    detail: exercise.detail,
    muscleGroups: muscleGroupLabel(exercise.primaryMuscleGroup, exercise.secondaryMuscleGroups, exercise.bodyParts),
    parameters: exercise.trackingParameters,
    trainer: fieldsFromCoach(exercise),
    fallbackUnit: exercise.loadUnit,
    previousSets: exercise.previousSets,
    sets: draftSets(exercise),
  };
}

function wholeNumberText(value: number | null) {
  return value == null ? "" : String(value);
}

function buildPayload(
  note: string,
  caloriesText: string,
  heartRateText: string,
  blocks: DraftBlock[],
): { error: string; session?: boolean; blockId?: string } | {
  note: string | null;
  calories: number | null;
  heart_rate_bpm: number | null;
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
      heart_rate_bpm: number | null;
      notes: string | null;
    }[];
  }[];
} {
  const calories = parseWholeNumber(caloriesText);
  const sessionHeartRate = parseWholeNumber(heartRateText);
  if (calories === undefined || sessionHeartRate === undefined) {
    return { error: "Use a whole number that is zero or greater for calories and heart rate.", session: true };
  }

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
      const heartRateBpm = parseWholeNumber(current.heartRateBpm);
      if (
        repetitions === undefined ||
        durationSeconds === undefined ||
        load === undefined ||
        distanceKm === undefined ||
        heightCm === undefined ||
        heartRateBpm === undefined
      ) {
        return {
          error: "Use whole numbers for reps, time, and heart rate, and a weight, distance, or height that is zero or greater.",
          blockId: block.id,
        };
      }
      sets.push({
        set_number: index + 1,
        repetitions,
        load,
        load_unit: current.loadUnit,
        duration_seconds: durationSeconds,
        distance_meters: distanceKm == null ? null : Math.round(distanceKm * 1000 * 100) / 100,
        height_cm: heightCm,
        heart_rate_bpm: heartRateBpm,
        notes: null,
      });
    }
    parsedBlocks.push({ block_id: block.id, sets });
  }

  return { note: note.trim() || null, calories, heart_rate_bpm: sessionHeartRate, blocks: parsedBlocks };
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
  onCommit,
  onBlur,
}: {
  title: string;
  values: SetFields;
  parameters: TrackingParameter[];
  disabled: boolean;
  onChange?: (patch: Partial<SetFields>) => void;
  onCommit?: (patch: Partial<SetFields>) => void;
  onBlur?: () => void;
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
              onBlur={onBlur}
              className={fieldClass}
            />
          </Field>
          <Field label="Unit" className="w-20">
            <select
              disabled={disabled}
              value={values.loadUnit}
              onChange={(event) => onCommit?.({ loadUnit: event.target.value === "lb" ? "lb" : "kg" })}
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
            onBlur={onBlur}
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
            onBlur={onBlur}
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
            onBlur={onBlur}
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
            onBlur={onBlur}
            className={fieldClass}
          />
        </Field>
      ) : null}
      {tracks(parameters, "heart_rate") ? (
        <Field label="Heart rate (bpm)" className="w-28">
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            readOnly={disabled}
            value={values.heartRateBpm}
            onChange={(event) => onChange?.({ heartRateBpm: event.target.value })}
            onBlur={onBlur}
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
