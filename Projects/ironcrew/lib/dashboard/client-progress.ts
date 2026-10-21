import { addDays, formatShortDate, type AssignmentStatus } from "@/lib/dashboard/client-week";

const LB_IN_KG = 0.45359237;
const TREND_WEEKS = 12;

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
  const bodyParts = new Map<string, ProgressBodyPart>();

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
    const weightKg = setWeightKg(set);
    const reps = set.repetitions != null && set.repetitions > 0 ? set.repetitions : 0;
    const maxWeightKg = loadInKg(set.load, set.loadUnit);
    if (weightKg === 0 && reps === 0 && maxWeightKg === 0) continue;
    const name = set.muscleGroup?.trim() || "Not set";
    const existing = bodyParts.get(name) ?? { name, weightKg: 0, reps: 0, maxWeightKg: 0 };
    existing.weightKg += weightKg;
    existing.reps += reps;
    existing.maxWeightKg = Math.max(existing.maxWeightKg, maxWeightKg);
    bodyParts.set(name, existing);
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
      .map((part) => ({ ...part, weightKg: round2(part.weightKg), maxWeightKg: round2(part.maxWeightKg) }))
      .sort((left, right) => right.weightKg - left.weightKg || right.maxWeightKg - left.maxWeightKg || left.name.localeCompare(right.name)),
  };
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
