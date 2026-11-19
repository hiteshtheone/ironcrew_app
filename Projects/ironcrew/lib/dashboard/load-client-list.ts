import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActiveProgramSummary } from "@/lib/api/active-programs";

import {
  currentWeek,
  firstNameFrom,
  formatLongDate,
  greetingFor,
  initialsFrom,
  isAssignmentStatus,
  resolveTimeZone,
} from "@/lib/dashboard/client-week";
import { clientRosterSignal, type RosterAssignment } from "@/lib/dashboard/client-roster";

type ProfileInput = {
  userId: string;
  fullName: string;
  timezone: string | null;
};

export type TrainerSession = {
  id: string;
  clientName: string;
  workoutName: string;
  statusLabel: string;
  initials: string;
  tone: string;
};

export type ClientGoal = {
  id: string;
  title: string;
  goalType: string;
  status: string;
  targetValue: number | null;
  targetUnit: string | null;
  targetDate: string | null;
  notes: string | null;
};

export type ClientRecord = {
  id: string;
  name: string;
  email: string | null;
  initials: string;
  tone: string;
  status: string;
  startedOn: string | null;
  goalTitle: string | null;
  goalType: string | null;
  linkedGoalId: string | null;
  goals: ClientGoal[];
  programName: string | null;
  programId: string | null;
  programStartsOn: string | null;
  /** True when a program this trainer assigned is active for the client. */
  hasActiveProgram: boolean;
  /** Every active program, including ones the client built for themselves. */
  activePrograms: ActiveProgramSummary[];
  /** Completed share of this month's non-cancelled workouts. Null when none were scheduled. */
  consistencyPercent: number | null;
  /** Change versus last month, or "No workouts this month" when this month is empty. */
  consistencyDelta: string;
  lastWorkoutName: string | null;
  lastWorkoutOn: string | null;
};

type ClientIdentity = Omit<
  ClientRecord,
  "consistencyPercent" | "consistencyDelta" | "lastWorkoutName" | "lastWorkoutOn"
>;

const ASSIGNMENT_PAGE_SIZE = 1000;

export type ClientListReady = {
  kind: "ready";
  greeting: string;
  firstName: string;
  fullName: string;
  dateLabel: string;
  initials: string;
  activeClients: number;
  newClientsLabel: string;
  myClients: ClientRecord[];
};

export type ClientListData = ClientListReady | { kind: "error"; message: string };

const AVATAR_TONES = [
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
];

export async function loadClientList(
  supabase: SupabaseClient,
  profile: ProfileInput,
): Promise<ClientListData> {
  const timeZone = resolveTimeZone(profile.timezone);
  const week = currentWeek(timeZone);
  const months = monthWindow(week.today);
  const shell = {
    greeting: greetingFor(timeZone),
    firstName: firstNameFrom(profile.fullName),
    fullName: profile.fullName.trim() || "Trainer",
    dateLabel: formatLongDate(week.today),
    initials: initialsFrom(profile.fullName),
  };

  // Get all clients for this trainer and status should be active
  const { data: links, error: linkError } = await supabase
    .from("trainer_clients")
    .select(
      "client_id, started_at, clients(first_name, last_name, email, status, goals(id, title, goal_type, status, target_value, target_unit, target_date, notes), program_assignments!program_assignments_client_id_fkey(id, status, starts_on, program_id, goal_id, assigned_by_client_id, programs(name)))",
    )
    .eq("trainer_id", profile.userId)
    .eq("status", "active");

  if (linkError) return { kind: "error", message: linkError.message };

  const clients = (links ?? [])
    .map((row) => normalizeClient(row, timeZone))
    .filter((client): client is ClientIdentity => client !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  const newThisMonth = clients.filter(
    (client) => client.startedOn !== null && client.startedOn >= months.thisStart && client.startedOn <= months.thisEnd,
  ).length;

  const clientIds = clients.map((client) => client.id);
  const rangeEnd = months.thisEnd > week.today ? months.thisEnd : week.today;
  const [windowResult, completedResult] = await Promise.all([
    loadWindowAssignments(supabase, clientIds, months.previousStart, rangeEnd),
    loadLatestCompleted(supabase, clientIds, week.today),
  ]);
  if ("error" in windowResult) return { kind: "error", message: windowResult.error };
  if ("error" in completedResult) return { kind: "error", message: completedResult.error };

  const windowByClient = groupAssignments(windowResult.rows);
  const completedByClient = groupAssignments(completedResult.rows);
  const myClients = clients.map((client) => ({
    ...client,
    ...clientRosterSignal(
      windowByClient.get(client.id) ?? [],
      completedByClient.get(client.id) ?? [],
      months,
      week.today,
    ),
  }));

  return {
    kind: "ready",
    ...shell,
    activeClients: clients.length,
    newClientsLabel: countLabel(newThisMonth, "new this month", "None new this month"),
    myClients,
  };
}

async function loadWindowAssignments(
  supabase: SupabaseClient,
  clientIds: string[],
  start: string,
  end: string,
): Promise<{ rows: RosterAssignment[] } | { error: string }> {
  if (clientIds.length === 0) return { rows: [] };

  const rows: RosterAssignment[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("workout_assignments")
      .select("id, client_id, scheduled_for, status, workouts(name)")
      .in("client_id", clientIds)
      .gte("scheduled_for", start)
      .lte("scheduled_for", end)
      .order("scheduled_for", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + ASSIGNMENT_PAGE_SIZE - 1);

    if (error) return { error: error.message };
    const page = data ?? [];
    for (const row of page) {
      const assignment = normalizeAssignment(row);
      if (assignment) rows.push(assignment);
    }
    if (page.length < ASSIGNMENT_PAGE_SIZE) return { rows };
    from += ASSIGNMENT_PAGE_SIZE;
  }
}

async function loadLatestCompleted(
  supabase: SupabaseClient,
  clientIds: string[],
  today: string,
): Promise<{ rows: RosterAssignment[] } | { error: string }> {
  if (clientIds.length === 0) return { rows: [] };

  const latest = new Map<string, RosterAssignment>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("workout_assignments")
      .select("id, client_id, scheduled_for, status, workouts(name)")
      .in("client_id", clientIds)
      .eq("status", "completed")
      .lte("scheduled_for", today)
      .order("scheduled_for", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + ASSIGNMENT_PAGE_SIZE - 1);

    if (error) return { error: error.message };
    const page = data ?? [];
    for (const row of page) {
      const assignment = normalizeAssignment(row);
      if (!assignment || latest.has(assignment.clientId)) continue;
      latest.set(assignment.clientId, assignment);
    }
    if (latest.size === clientIds.length || page.length < ASSIGNMENT_PAGE_SIZE) {
      return { rows: [...latest.values()] };
    }
    from += ASSIGNMENT_PAGE_SIZE;
  }
}

function groupAssignments(rows: RosterAssignment[]) {
  const grouped = new Map<string, RosterAssignment[]>();
  for (const row of rows) {
    const existing = grouped.get(row.clientId);
    if (existing) existing.push(row);
    else grouped.set(row.clientId, [row]);
  }
  return grouped;
}

function normalizeAssignment(row: unknown): RosterAssignment | null {
  const record = asRecord(row);
  if (!record) return null;

  const clientId = stringField(record, "client_id");
  const scheduledFor = stringField(record, "scheduled_for");
  const status = stringField(record, "status");
  if (!clientId || !scheduledFor || !status || !isAssignmentStatus(status)) return null;

  const workout = asRecord(firstRelation(record.workouts));
  return {
    clientId,
    scheduledFor,
    status,
    workoutName: stringField(workout, "name") || "Workout",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function hashTone(id: string) {
  const total = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return total % AVATAR_TONES.length;
}

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function countLabel(count: number, suffix: string, empty: string) {
  if (count === 0) return empty;
  return `${count} ${suffix}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
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

function formatUtcYmd(date: Date) {
  return date.toISOString().slice(0, 10);
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

function normalizeClient(row: unknown, timeZone: string): ClientIdentity | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = stringField(record, "client_id");
  const client = asRecord(firstRelation(record.clients));
  const status = stringField(client, "status");
  const firstName = stringField(client, "first_name");
  if (!client || !id || !firstName || status !== "active") return null;

  const lastName = stringField(client, "last_name");
  const email = stringField(client, "email");
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const startedAt = stringField(record, "started_at");
  const plan = activePlan(client);

  return {
    id,
    name,
    email,
    initials: initialsFrom(name),
    tone: AVATAR_TONES[hashTone(id)],
    status: status,
    startedOn: startedAt ? ymdInTimeZone(startedAt, timeZone) : null,
    goalTitle: plan.goalTitle,
    goalType: plan.goalType,
    linkedGoalId: plan.linkedGoalId,
    goals: plan.goals,
    programName: plan.programName,
    programId: plan.programId,
    programStartsOn: plan.programStartsOn,
    hasActiveProgram: plan.hasActiveProgram,
    activePrograms: plan.activePrograms,
  };
}

function activePlan(client: Record<string, unknown>) {
  const goals = asArray(client.goals)
    .map(normalizeGoal)
    .filter((goal): goal is ClientGoal => goal !== null)
    .sort((left, right) => left.title.localeCompare(right.title));

  const assignments = asArray(client.program_assignments)
    .map((row) => {
      const assignment = asRecord(row);
      const program = asRecord(firstRelation(assignment?.programs));
      return {
        status: stringField(assignment, "status"),
        startsOn: stringField(assignment, "starts_on"),
        programId: stringField(assignment, "program_id"),
        goalId: stringField(assignment, "goal_id"),
        programName: stringField(program, "name"),
        selfMade: stringField(assignment, "assigned_by_client_id") !== null,
      };
    })
    .filter((assignment) => assignment.status === "scheduled" || assignment.status === "in_progress")
    .sort((left, right) => (right.startsOn ?? "").localeCompare(left.startsOn ?? ""));

  // Only trainer-assigned programs drive the plan card: a trainer cannot read
  // or edit a program the client built for themselves.
  const active = assignments.find((assignment) => !assignment.selfMade) ?? null;
  const activePrograms: ActiveProgramSummary[] = assignments.flatMap((assignment) => {
    if (!assignment.programId) return [];
    return [{
      id: assignment.programId,
      name: assignment.programName ?? (assignment.selfMade ? "Self-made program" : "Assigned program"),
      source: assignment.selfMade ? "self" : "trainer",
    }];
  });
  const linkedGoal = active?.goalId ? goals.find((goal) => goal.id === active.goalId) : null;
  const goal = linkedGoal ?? goals.find((item) => item.status === "active") ?? null;

  return {
    goalTitle: goal?.title ?? null,
    goalType: goal?.goalType ?? null,
    linkedGoalId: goal?.id ?? null,
    goals,
    programName: active?.programName ?? null,
    programId: active?.programId ?? null,
    programStartsOn: active?.startsOn ?? null,
    hasActiveProgram: active !== null,
    activePrograms,
  };
}

function normalizeGoal(row: unknown): ClientGoal | null {
  const goal = asRecord(row);
  const id = stringField(goal, "id");
  const title = stringField(goal, "title");
  const goalType = stringField(goal, "goal_type");
  const status = stringField(goal, "status");
  if (!id || !title || !goalType || !status) return null;
  return {
    id,
    title,
    goalType,
    status,
    targetValue: numberValue(goal?.target_value),
    targetUnit: stringField(goal, "target_unit"),
    targetDate: stringField(goal, "target_date"),
    notes: stringField(goal, "notes"),
  };
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}
