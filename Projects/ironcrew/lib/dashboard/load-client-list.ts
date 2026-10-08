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

type ClientRecord = {
  id: string;
  name: string;
  email: string;
  initials: string;
  tone: string;
  status: string;
  startedOn: string | null;
};

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
    .select("client_id, started_at, clients(first_name, last_name, email, status)")
    .eq("trainer_id", profile.userId)
    .eq("status", "active");

  if (linkError) return { kind: "error", message: linkError.message };

  const clients = (links ?? [])
    .map((row) => normalizeClient(row, timeZone))
    .filter((client): client is ClientRecord => client !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  const newThisMonth = clients.filter(
    (client) => client.startedOn !== null && client.startedOn >= months.thisStart && client.startedOn <= months.thisEnd,
  ).length;

  return {
    kind: "ready",
    ...shell,
    activeClients: clients.length,
    newClientsLabel: countLabel(newThisMonth, "new this month", "None new this month"),
    myClients: clients,
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

function normalizeClient(row: unknown, timeZone: string): ClientRecord | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = stringField(record, "client_id");
  const client = asRecord(firstRelation(record.clients));
  const status = stringField(client, "status");
  const firstName = stringField(client, "first_name");
  if (!id || !firstName || status !== "active") return null;

  const lastName = stringField(client, "last_name");
  const email = stringField(client, "email");
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const startedAt = stringField(record, "started_at");

  return {
    id,
    name,
    email,
    initials: initialsFrom(name),
    tone: AVATAR_TONES[hashTone(id)],
    status: status,
    startedOn: startedAt ? ymdInTimeZone(startedAt, timeZone) : null,
  };
}
