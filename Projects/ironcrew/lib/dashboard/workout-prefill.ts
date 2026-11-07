import type { ClientExercise, ClientLoggedSet } from "./client-week";

export const MAX_PREFILL_SETS = 20;

export type PriorResult = {
  assignmentId: string;
  scheduledFor: string;
  startedAt: string;
  createdAt: string;
  blockId: string | null;
  exerciseId: string | null;
  set: ClientLoggedSet;
};

export type SetFields = {
  repetitions: string;
  load: string;
  loadUnit: "kg" | "lb";
  durationSeconds: string;
  distanceKm: string;
  heightCm: string;
};

/** Trainer and previous rows are display-only. Current is what this session saves. */
export type SetDraft = {
  trainer: SetFields;
  previous: SetFields;
  current: SetFields;
};

export function previousSetsForBlock(
  results: PriorResult[],
  current: { assignmentId: string; scheduledFor: string; blockId: string; exerciseId: string | null },
): ClientLoggedSet[] {
  const earlier = results.filter(
    (row) => row.assignmentId !== current.assignmentId && row.scheduledFor < current.scheduledFor,
  );
  const byBlock = earlier.filter((row) => row.blockId === current.blockId);
  const matched =
    byBlock.length > 0
      ? byBlock
      : current.exerciseId
        ? earlier.filter((row) => row.exerciseId === current.exerciseId)
        : [];
  return setsFromLatestSession(matched);
}

export function draftSets(exercise: ClientExercise): SetDraft[] {
  const saved = new Map(exercise.sets.map((set) => [set.setNumber, set]));
  const previous = new Map(exercise.previousSets.map((set) => [set.setNumber, set]));
  const count = visibleSetCount(exercise);
  const trainer = fieldsFromCoach(exercise);

  return Array.from({ length: count }, (_, index) => ({
    trainer,
    previous: fieldsFromLog(previous.get(index + 1), exercise.loadUnit),
    current: fieldsFromLog(saved.get(index + 1), exercise.loadUnit),
  }));
}

export function fieldsFromCoach(
  prescription: Pick<
    ClientExercise,
    "repsMin" | "repsMax" | "load" | "loadUnit" | "durationSeconds" | "distanceMeters" | "heightCm"
  >,
): SetFields {
  return {
    repetitions: numberText(prescription.repsMin ?? prescription.repsMax),
    load: numberText(prescription.load),
    loadUnit: loadUnitOrDefault(prescription.loadUnit),
    durationSeconds: numberText(prescription.durationSeconds),
    distanceKm: metersToKm(prescription.distanceMeters),
    heightCm: numberText(prescription.heightCm),
  };
}

export function fieldsFromLog(set: ClientLoggedSet | undefined, fallbackUnit: string | null): SetFields {
  return {
    repetitions: numberText(set?.repetitions),
    load: numberText(set?.load),
    loadUnit: loadUnitOrDefault(set?.loadUnit ?? fallbackUnit),
    durationSeconds: numberText(set?.durationSeconds),
    distanceKm: metersToKm(set?.distanceMeters ?? null),
    heightCm: numberText(set?.heightCm),
  };
}

function visibleSetCount(exercise: ClientExercise) {
  const previousHigh = exercise.previousSets.reduce((max, set) => Math.max(max, set.setNumber), 0);
  const logged = exercise.sets.map((set) => set.setNumber);
  return Math.min(
    MAX_PREFILL_SETS,
    Math.max(exercise.prescribedSets ?? (previousHigh || 1), ...logged, 1),
  );
}

function setsFromLatestSession(rows: PriorResult[]): ClientLoggedSet[] {
  if (rows.length === 0) return [];
  const best = rows.reduce((winner, row) => (sessionIsLater(row, winner) ? row : winner));
  const sets = new Map<number, ClientLoggedSet>();
  const inSession = rows
    .filter((row) => row.assignmentId === best.assignmentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  for (const row of inSession) {
    if (sets.has(row.set.setNumber)) continue;
    sets.set(row.set.setNumber, row.set);
  }
  return [...sets.values()].sort((left, right) => left.setNumber - right.setNumber);
}

function sessionIsLater(row: PriorResult, winner: PriorResult) {
  if (row.scheduledFor !== winner.scheduledFor) return row.scheduledFor > winner.scheduledFor;
  return row.startedAt > winner.startedAt;
}

function numberText(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function metersToKm(meters: number | null) {
  if (meters == null) return "";
  return String(Math.round((meters / 1000) * 1000) / 1000);
}

function loadUnitOrDefault(unit: string | null | undefined): "kg" | "lb" {
  const normalized = unit?.trim().toLowerCase();
  if (normalized === "lb" || normalized === "lbs") return "lb";
  return "kg";
}
