import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type AssignmentStatus,
  currentWeek,
  firstNameFrom,
  formatLongDate,
  greetingFor,
  initialsFrom,
  isAssignmentStatus,
  resolveTimeZone,
  statusLabel,
} from "@/lib/dashboard/client-week";

type ProfileInput = {
  userId: string;
  fullName: string;
  timezone: string | null;
};

type ClientRecord = {
  id: string;
  name: string;
  initials: string;
  tone: string;
  startedOn: string | null;
};

type AssignmentRecord = {
  id: string;
  clientId: string;
  scheduledFor: string;
  status: AssignmentStatus;
  workoutName: string;
};

export type TrainerSession = {
  id: string;
  clientName: string;
  workoutName: string;
  statusLabel: string;
  initials: string;
  tone: string;
};

export type TrainerProgress = {
  clientId: string;
  name: string;
  value: string;
  change: string;
  width: number;
  initials: string;
  tone: string;
};

export type TrainerDashboardReady = {
  kind: "ready";
  greeting: string;
  firstName: string;
  fullName: string;
  dateLabel: string;
  initials: string;
  activeClients: number;
  newClientsLabel: string;
  completedToday: number;
  completedTodayDetail: string;
  pendingToday: number;
  pendingTodayDetail: string;
  adherenceLabel: string;
  adherenceDetail: string;
  todaySessions: TrainerSession[];
  weekCompletion: number;
  weekDeltaLabel: string;
  weekComparison: string;
  progress: TrainerProgress[];
};

export type TrainerDashboardData = TrainerDashboardReady | { kind: "error"; message: string };

const AVATAR_TONES = [
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
];

export async function loadTrainerDashboard(
  supabase: SupabaseClient,
  profile: ProfileInput,
): Promise<TrainerDashboardData> {
  const timeZone = resolveTimeZone(profile.timezone);
  const week = currentWeek(timeZone);
  const months = monthWindow(week.today);
  const lastWeek = {
    start: addDays(week.start, -7),
    end: addDays(week.end, -7),
  };
  const shell = {
    greeting: greetingFor(timeZone),
    firstName: firstNameFrom(profile.fullName),
    fullName: profile.fullName.trim() || "Trainer",
    dateLabel: formatLongDate(week.today),
    initials: initialsFrom(profile.fullName),
  };

  const { data: links, error: linkError } = await supabase
    .from("trainer_clients")
    .select("client_id, started_at, clients(first_name, last_name, status)")
    .eq("trainer_id", profile.userId)
    .eq("status", "active");

  if (linkError) return { kind: "error", message: linkError.message };

  const clients = (links ?? [])
    .map((row) => normalizeClient(row, timeZone))
    .filter((client): client is ClientRecord => client !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const rangeEnd = months.thisEnd > week.end ? months.thisEnd : week.end;

  let assignments: AssignmentRecord[] = [];
  if (clients.length > 0) {
    const { data, error } = await supabase
      .from("workout_assignments")
      .select("id, client_id, scheduled_for, status, workouts(name)")
      .in("client_id", clients.map((client) => client.id))
      .gte("scheduled_for", months.previousStart)
      .lte("scheduled_for", rangeEnd)
      .order("scheduled_for", { ascending: true });

    if (error) return { kind: "error", message: error.message };
    assignments = (data ?? [])
      .map(normalizeAssignment)
      .filter((assignment): assignment is AssignmentRecord => assignment !== null);
  }

  const today = assignments.filter((assignment) => assignment.scheduledFor === week.today);
  const todayActive = today.filter((assignment) => assignment.status !== "cancelled");
  const completedToday = todayActive.filter((assignment) => assignment.status === "completed");
  const pendingToday = todayActive.filter(
    (assignment) => assignment.status === "scheduled" || assignment.status === "in_progress",
  );
  const todayRate = rate(todayActive);

  const thisMonth = rate(inRange(assignments, months.thisStart, months.thisEnd));
  const lastMonth = rate(inRange(assignments, months.previousStart, months.previousEnd));
  const thisWeekRate = rate(inRange(assignments, week.start, week.end));
  const lastWeekRate = rate(inRange(assignments, lastWeek.start, lastWeek.end));

  const newThisMonth = clients.filter(
    (client) => client.startedOn !== null && client.startedOn >= months.thisStart && client.startedOn <= months.thisEnd,
  ).length;

  return {
    kind: "ready",
    ...shell,
    activeClients: clients.length,
    newClientsLabel: countLabel(newThisMonth, "new this month", "None new this month"),
    completedToday: completedToday.length,
    completedTodayDetail: todayRate.percent === null ? "No workouts scheduled" : `${todayRate.percent}% of scheduled`,
    pendingToday: pendingToday.length,
    pendingTodayDetail: pendingToday.length > 0 ? "Need a reminder" : "Nothing waiting",
    adherenceLabel: thisMonth.percent === null ? "—" : `${thisMonth.percent}%`,
    adherenceDetail: periodComparison(thisMonth.percent, lastMonth.percent, "this month", "No workouts this month", "No assignments last month"),
    todaySessions: todayActive
      .map((assignment) => toSession(assignment, clientsById.get(assignment.clientId)))
      .filter((session): session is TrainerSession => session !== null)
      .sort((left, right) => left.clientName.localeCompare(right.clientName)),
    weekCompletion: thisWeekRate.percent ?? 0,
    weekDeltaLabel: weekDelta(thisWeekRate.percent, lastWeekRate.percent),
    weekComparison: thisWeekRate.percent === null ? "No workouts this week" : "versus last week",
    progress: progressFor(clients, assignments, months),
  };
}

function progressFor(
  clients: ClientRecord[],
  assignments: AssignmentRecord[],
  months: { thisStart: string; thisEnd: string; previousStart: string; previousEnd: string },
) {
  return clients
    .map((client) => {
      const rows = assignments.filter((assignment) => assignment.clientId === client.id);
      const counted = rows.filter((assignment) => assignment.status !== "cancelled");
      if (counted.length === 0) return null;

      const current = rate(inRange(rows, months.thisStart, months.thisEnd));
      const previous = rate(inRange(rows, months.previousStart, months.previousEnd));
      const percent = current.percent ?? 0;

      return {
        client,
        volume: current.total,
        card: {
          clientId: client.id,
          name: client.name,
          value: `${percent}%`,
          change: signedDelta(percent, previous.percent),
          width: percent,
          initials: client.initials,
          tone: client.tone,
        } satisfies TrainerProgress,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.volume - left.volume || left.client.name.localeCompare(right.client.name))
    .slice(0, 3)
    .map((entry) => entry.card);
}

function toSession(assignment: AssignmentRecord, client: ClientRecord | undefined): TrainerSession | null {
  if (!client) return null;
  return {
    id: assignment.id,
    clientName: client.name,
    workoutName: assignment.workoutName,
    statusLabel: statusLabel(assignment.status),
    initials: client.initials,
    tone: client.tone,
  };
}

function normalizeClient(row: unknown, timeZone: string): ClientRecord | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = stringField(record, "client_id");
  const client = asRecord(firstRelation(record.clients));
  const status = stringField(client, "status");
  const firstName = stringField(client, "first_name");
  if (!id || !firstName || status !== "active") return null;

  const lastName = stringField(client, "last_name");
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const startedAt = stringField(record, "started_at");

  return {
    id,
    name,
    initials: initialsFrom(name),
    tone: AVATAR_TONES[hashTone(id)],
    startedOn: startedAt ? ymdInTimeZone(startedAt, timeZone) : null,
  };
}

function normalizeAssignment(row: unknown): AssignmentRecord | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = stringField(record, "id");
  const clientId = stringField(record, "client_id");
  const scheduledFor = stringField(record, "scheduled_for");
  const status = stringField(record, "status");
  if (!id || !clientId || !scheduledFor || !status || !isAssignmentStatus(status)) return null;

  const workout = asRecord(firstRelation(record.workouts));
  return {
    id,
    clientId,
    scheduledFor,
    status,
    workoutName: stringField(workout, "name") || "Workout",
  };
}

function inRange(assignments: AssignmentRecord[], start: string, end: string) {
  return assignments.filter((assignment) => assignment.scheduledFor >= start && assignment.scheduledFor <= end);
}

function rate(assignments: AssignmentRecord[]) {
  const active = assignments.filter((assignment) => assignment.status !== "cancelled");
  const completed = active.filter((assignment) => assignment.status === "completed").length;
  return {
    completed,
    total: active.length,
    percent: active.length === 0 ? null : Math.round((completed / active.length) * 100),
  };
}

function periodComparison(
  current: number | null,
  previous: number | null,
  period: string,
  emptyCurrent: string,
  emptyPrevious: string,
) {
  if (current === null) return emptyCurrent;
  if (previous === null) return emptyPrevious;
  if (current > previous) return `Up ${current - previous}% ${period}`;
  if (current < previous) return `Down ${previous - current}% ${period}`;
  return `Same as last ${period === "this month" ? "month" : "week"}`;
}

function weekDelta(current: number | null, previous: number | null) {
  if (current === null) return "0%";
  if (previous === null) return "New";
  return signedDelta(current, previous);
}

function signedDelta(current: number, previous: number | null) {
  if (previous === null) return "New";
  const delta = current - previous;
  if (delta > 0) return `+${delta}%`;
  if (delta < 0) return `${delta}%`;
  return "0%";
}

function countLabel(count: number, suffix: string, empty: string) {
  if (count === 0) return empty;
  return `${count} ${suffix}`;
}

function monthWindow(today: string) {
  const [year, month] = today.split("-").map(Number);
  const thisStart = `${year}-${pad(month)}-01`;
  const thisEnd = formatUtcYmd(new Date(Date.UTC(year, month, 0)));
  const previousStartDate = new Date(Date.UTC(year, month - 2, 1));
  const previousEndDate = new Date(Date.UTC(year, month - 1, 0));

  return {
    thisStart,
    thisEnd,
    previousStart: formatUtcYmd(previousStartDate),
    previousEnd: formatUtcYmd(previousEndDate),
  };
}

function ymdInTimeZone(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcYmd(date);
}

function formatUtcYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function hashTone(id: string) {
  const total = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return total % AVATAR_TONES.length;
}

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}
