import { NextResponse } from "next/server";

import { requireClientAccount } from "@/lib/api/signed-in-client";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/api/route-utils";
import { currentWeek } from "@/lib/dashboard/client-week";

const PAGE_SIZE = 10;
const WHEN = ["past", "present", "future"] as const;
const COMPLETION = ["finished", "unfinished", "cancelled"] as const;

type When = (typeof WHEN)[number];
type Completion = (typeof COMPLETION)[number];

const STATUSES: Record<Completion, string[]> = {
  finished: ["completed"],
  unfinished: ["scheduled", "in_progress", "skipped"],
  cancelled: ["cancelled"],
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const when = url.searchParams.get("when");
  const status = url.searchParams.get("status");
  const page = positivePage(url.searchParams.get("page"));

  if (!isWhen(when)) return jsonError("when must be past, present, or future", 400);
  if (!isCompletion(status)) return jsonError("status must be finished, unfinished, or cancelled", 400);
  if (page == null) return jsonError("page must be a whole number of 1 or greater", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const today = currentWeek(client.timeZone).today;
  const ascending = when === "future";
  const from = (page - 1) * PAGE_SIZE;
  let query = auth.supabase
    .from("workout_assignments")
    .select(
      `
      id,
      scheduled_for,
      status,
      workouts ( name, estimated_duration_minutes )
    `,
      { count: "exact" },
    )
    .eq("client_id", client.clientId)
    .in("status", STATUSES[status]);

  if (when === "past") query = query.lt("scheduled_for", today);
  else if (when === "present") query = query.eq("scheduled_for", today);
  else query = query.gt("scheduled_for", today);

  const { data, error, count } = await query
    .order("scheduled_for", { ascending })
    .order("id", { ascending })
    .range(from, from + PAGE_SIZE - 1);

  if (error) return jsonError(databaseErrorMessage(error), 500);

  return NextResponse.json({
    workouts: (data ?? []).map(normalizeWorkout).filter((workout) => workout !== null),
    page,
    pageSize: PAGE_SIZE,
    total: count ?? 0,
  });
}

function normalizeWorkout(row: unknown) {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const scheduledFor = stringField(record, "scheduled_for");
  const status = stringField(record, "status");
  if (!record || !id || !scheduledFor || !status) return null;
  const workout = asRecord(firstRelation(record.workouts));
  const duration = positiveNumber(workout?.estimated_duration_minutes);
  return {
    id,
    name: stringField(workout, "name") || "Workout",
    scheduledFor,
    status,
    durationMinutes: duration,
  };
}

function isWhen(value: string | null): value is When {
  return (WHEN as readonly string[]).includes(value ?? "");
}

function isCompletion(value: string | null): value is Completion {
  return (COMPLETION as readonly string[]).includes(value ?? "");
}

function positivePage(value: string | null) {
  if (value == null || value === "") return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return page >= 1 ? page : null;
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

function positiveNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  return parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
