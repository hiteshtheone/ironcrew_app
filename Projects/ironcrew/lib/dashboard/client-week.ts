export const ASSIGNMENT_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "skipped",
  "cancelled",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export type ClientExercise = {
  id: string;
  name: string;
  detail: string | null;
};

export type ClientWorkout = {
  id: string;
  name: string;
  durationMinutes: number | null;
  status: AssignmentStatus;
  exercises: ClientExercise[];
};

export type ClientDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  isToday: boolean;
  workouts: Pick<ClientWorkout, "id" | "name" | "status">[];
};

export type ClientDashboardReady = {
  kind: "ready";
  greeting: string;
  firstName: string;
  dateLabel: string;
  initials: string;
  programName: string | null;
  days: ClientDay[];
  todayWorkouts: ClientWorkout[];
  nextWorkout: { name: string; dateLabel: string } | null;
  scheduledCount: number;
  completedCount: number;
  remainingCount: number;
};

export type ClientDashboardData =
  | ClientDashboardReady
  | { kind: "unlinked"; greeting: string; firstName: string; dateLabel: string; initials: string }
  | { kind: "error"; message: string };

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function resolveTimeZone(timeZone: string | null | undefined) {
  const candidate = timeZone?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

export function currentWeek(timeZone: string, now = new Date()) {
  const today = formatYmd(now, timeZone);
  const noon = new Date(`${today}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(noon);
  const dayIndex = WEEKDAY_INDEX[weekday] ?? 0;
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const monday = addUtcDays(noon, mondayOffset);
  const days = Array.from({ length: 7 }, (_, index) => formatUtcYmd(addUtcDays(monday, index)));

  return { today, start: days[0], end: days[6], days };
}

export function greetingFor(timeZone: string, now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatLongDate(ymd: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

export function formatWeekday(ymd: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

export function formatDayNumber(ymd: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

export function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "C";
}

export function firstNameFrom(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function isAssignmentStatus(value: string): value is AssignmentStatus {
  return (ASSIGNMENT_STATUSES as readonly string[]).includes(value);
}

export function statusLabel(status: AssignmentStatus) {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "cancelled":
      return "Cancelled";
    default:
      return "Scheduled";
  }
}

export function prescriptionDetail(
  sets: number | null,
  repsMin: number | null,
  repsMax: number | null,
) {
  const reps =
    repsMin && repsMax && repsMin !== repsMax
      ? `${repsMin}–${repsMax} reps`
      : repsMin
        ? `${repsMin} reps`
        : repsMax
          ? `${repsMax} reps`
          : null;
  const setLabel = sets ? `${sets} ${sets === 1 ? "set" : "sets"}` : null;
  return [setLabel, reps].filter(Boolean).join(" · ") || null;
}

function formatYmd(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatUtcYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
