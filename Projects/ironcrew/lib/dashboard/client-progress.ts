import { addDays, formatShortDate, type AssignmentStatus } from "@/lib/dashboard/client-week";
import { muscleLabel } from "@/lib/exercises/muscle-group";

const LB_IN_KG = 0.45359237;
const TREND_WEEKS = 12;
/** Share of a set's used weight credited to the primary muscle when secondaries are set. */
const PRIMARY_WEIGHT_SHARE = 0.6;
/** The rest is split evenly across secondary muscles. */
const SECONDARY_WEIGHT_SHARE = 1 - PRIMARY_WEIGHT_SHARE;

export type ProgressAssignment = {
  scheduledFor: string;
  status: AssignmentStatus;
};

export type ProgressSet = {
  scheduledFor: string;
  repetitions: number | null;
  load: number | null;
  loadUnit: string | null;
  distanceMeters: number | null;
  exerciseName: string | null;
  equipment: string | null;
  muscleGroup: string | null;
  secondaryMuscleGroups: string[];
};

export type ProgressWeek = {
  start: string;
  label: string;
  ranKm: number;
  rodeKm: number;
  weightKg: number;
  reps: number;
};

export type ProgressBodyPart = {
  name: string;
  weightKg: number;
  reps: number;
  maxWeightKg: number;
};

export type ClientProgressReport = {
  weekStart: string;
  weekEnd: string;
  completion: {
    completed: number;
    notCompleted: number;
    cancelled: number;
    percent: number;
  };
  weeks: ProgressWeek[];
  bodyParts: ProgressBodyPart[];
};

export function movementKind(name: string | null, equipment: string | null) {
  const text = `${name ?? ""} ${equipment ?? ""}`.toLowerCase();
  if (/(ride|riding|bike|biking|bicycle|cycle|cycling)/.test(text)) return "rode" as const;
  if (/(run|jog|treadmill)/.test(text)) return "ran" as const;
  return null;
}

export function loadInKg(load: number | null, loadUnit: string | null) {
  if (load == null || load < 0) return 0;
  return (loadUnit ?? "").trim().toLowerCase() === "lb" ? load * LB_IN_KG : load;
}

export function setWeightKg(set: Pick<ProgressSet, "load" | "loadUnit" | "repetitions">) {
  const kg = loadInKg(set.load, set.loadUnit);
  if (kg === 0) return 0;
  return set.repetitions == null ? kg : kg * set.repetitions;
}

export function buildClientProgress(
  weekStart: string,
  assignments: ProgressAssignment[],
  sets: ProgressSet[],
): ClientProgressReport {
  const weekEnd = addDays(weekStart, 6);
  const starts = Array.from({ length: TREND_WEEKS }, (_, index) => addDays(weekStart, (index - (TREND_WEEKS - 1)) * 7));
  const weeks = starts.map((start) => ({
    start,
    label: formatShortDate(start),
    ranKm: 0,
    rodeKm: 0,
    weightKg: 0,
    reps: 0,
  }));
  const weekByStart = new Map(weeks.map((week) => [week.start, week]));
  const bodyParts = new Map<string, ProgressBodyPart & { weightedLoad: number; weightReps: number }>();

  for (const set of sets) {
    const start = weekStartFor(set.scheduledFor);
    const week = weekByStart.get(start);
    if (!week) continue;

    const kind = movementKind(set.exerciseName, set.equipment);
    const distanceKm = set.distanceMeters != null && set.distanceMeters > 0 ? set.distanceMeters / 1000 : 0;
    if (kind === "ran") week.ranKm += distanceKm;
    if (kind === "rode") week.rodeKm += distanceKm;
    week.weightKg += setWeightKg(set);
    week.reps += set.repetitions != null && set.repetitions > 0 ? set.repetitions : 0;

    if (start !== weekStart) continue;
    const loadPerRep = loadInKg(set.load, set.loadUnit);
    const reps = set.repetitions != null && set.repetitions > 0 ? set.repetitions : 0;
    const weightReps = reps > 0 ? reps : loadPerRep > 0 ? 1 : 0;
    if (loadPerRep === 0 && reps === 0) continue;
    for (const share of muscleWeightShares(set)) {
      const existing = bodyParts.get(share.name) ?? { name: share.name, weightKg: 0, reps: 0, maxWeightKg: 0, weightedLoad: 0, weightReps: 0 };
      existing.weightedLoad += loadPerRep * share.weightShare * weightReps;
      existing.weightReps += weightReps;
      existing.reps += reps;
      existing.maxWeightKg = Math.max(existing.maxWeightKg, loadPerRep);
      bodyParts.set(share.name, existing);
    }
  }

  for (const week of weeks) {
    week.ranKm = round2(week.ranKm);
    week.rodeKm = round2(week.rodeKm);
    week.weightKg = round2(week.weightKg);
  }

  const selected = assignments.filter((assignment) => assignment.scheduledFor >= weekStart && assignment.scheduledFor <= weekEnd);
  const cancelled = selected.filter((assignment) => assignment.status === "cancelled").length;
  const active = selected.filter((assignment) => assignment.status !== "cancelled");
  const completed = active.filter((assignment) => assignment.status === "completed").length;
  const notCompleted = active.length - completed;
  const percent = active.length > 0 ? Math.round((completed / active.length) * 100) : 0;

  return {
    weekStart,
    weekEnd,
    completion: { completed, notCompleted, cancelled, percent },
    weeks,
    bodyParts: [...bodyParts.values()]
      .map((part) => ({
        name: part.name,
        weightKg: round2(part.weightReps > 0 ? part.weightedLoad / part.weightReps : 0),
        reps: part.reps,
        maxWeightKg: round2(part.maxWeightKg),
      }))
      .sort((left, right) => right.weightKg - left.weightKg || right.maxWeightKg - left.maxWeightKg || left.name.localeCompare(right.name)),
  };
}

function muscleWeightShares(set: Pick<ProgressSet, "muscleGroup" | "secondaryMuscleGroups">) {
  const primary = muscleLabel(set.muscleGroup);
  const secondary: string[] = [];
  for (const muscle of set.secondaryMuscleGroups) {
    const name = muscleLabel(muscle);
    if (name == null || name === primary || secondary.includes(name)) continue;
    secondary.push(name);
  }
  if (primary && secondary.length > 0) {
    const each = SECONDARY_WEIGHT_SHARE / secondary.length;
    return [{ name: primary, weightShare: PRIMARY_WEIGHT_SHARE }, ...secondary.map((name) => ({ name, weightShare: each }))];
  }
  if (primary) return [{ name: primary, weightShare: 1 }];
  if (secondary.length > 0) {
    const each = 1 / secondary.length;
    return secondary.map((name) => ({ name, weightShare: each }));
  }
  return [{ name: "Not set", weightShare: 1 }];
}

function weekStartFor(ymd: string) {
  const noon = new Date(`${ymd}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(noon);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const mondayOffset = index === 0 ? -6 : 1 - index;
  return addDays(ymd, mondayOffset);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
