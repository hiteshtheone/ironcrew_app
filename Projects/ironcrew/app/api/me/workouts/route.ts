import { NextResponse } from "next/server";

import { requireClientAccount } from "@/lib/api/signed-in-client";
import {
  asTrimmedString,
  databaseErrorMessage,
  isIsoDate,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";
import { currentWeek } from "@/lib/dashboard/client-week";
import { WORKOUT_SOURCE_COLUMNS, workoutSourceFromRow } from "@/lib/dashboard/workout-source";
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  STATUS_GROUPS,
  computeCounts,
  isSortOrder,
  isStatusFilter,
  isWhenFilter,
  parsePage,
  whenRange,
  type DateBounds,
} from "@/lib/dashboard/workout-filters";

export async function POST(request: Request) {
  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const input = parsedBody.body;
  const workoutId = asTrimmedString(input.workout_id);
  const scheduledFor = asTrimmedString(input.scheduled_for);
  const notes = asTrimmedString(input.notes);

  if (workoutId === undefined || scheduledFor === undefined || notes === undefined) {
    return jsonError("Workout fields must be strings or null", 400);
  }
  if (workoutId == null || !isUuid(workoutId)) return jsonError("workout_id must be a UUID", 400);
  if (scheduledFor == null || !isIsoDate(scheduledFor)) return jsonError("scheduled_for must be YYYY-MM-DD", 400);
  if (notes && notes.length > 10000) return jsonError("notes must be 10000 characters or fewer", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const { data, error } = await auth.supabase
    .from("workout_assignments")
    .insert({
      client_id: client.clientId,
      workout_id: workoutId,
      assigned_by_client_id: client.clientId,
      assigned_by_trainer_id: null,
      scheduled_for: scheduledFor,
      notes,
      status: "scheduled",
    })
    .select("id, client_id, workout_id, scheduled_for, status, notes")
    .single();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const when = url.searchParams.get("when") ?? DEFAULT_FILTERS.when;
  const status = url.searchParams.get("status") ?? DEFAULT_FILTERS.status;
  const sort = url.searchParams.get("sort") ?? DEFAULT_FILTERS.sort;
  const page = parsePage(url.searchParams.get("page"));

  if (!isWhenFilter(when)) {
    return jsonError("when must be all, past, present, future, this_week, last_week or next_week", 400);
  }
  if (!isStatusFilter(status)) return jsonError("status must be finished, unfinished, cancelled or all", 400);
  if (!isSortOrder(sort)) return jsonError("sort must be date_desc or date_asc", 400);
  if (page == null) return jsonError("page must be a whole number of 1 or greater", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const week = currentWeek(client.timeZone);
  const bounds: DateBounds = { today: week.today, weekStart: week.start, weekEnd: week.end };
  const range = whenRange(when, bounds);
  const ascending = sort === "date_asc";
  const from = (page - 1) * PAGE_SIZE;

  let listQuery = auth.supabase
    .from("workout_assignments")
    .select(
      `
      id,
      scheduled_for,
      status,
      ${WORKOUT_SOURCE_COLUMNS},
      workouts ( name, estimated_duration_minutes )
    `,
      { count: "exact" },
    )
    .eq("client_id", client.clientId)
    .in("status", [...STATUS_GROUPS[status]]);

  if (range.gte) listQuery = listQuery.gte("scheduled_for", range.gte);
  if (range.lte) listQuery = listQuery.lte("scheduled_for", range.lte);

  // Lightweight rows used only to derive the faceted count badges.
  const countsQuery = auth.supabase
    .from("workout_assignments")
    .select("scheduled_for, status")
    .eq("client_id", client.clientId);

  const [list, facets] = await Promise.all([
    listQuery
      .order("scheduled_for", { ascending })
      .order("id", { ascending })
      .range(from, from + PAGE_SIZE - 1),
    countsQuery,
  ]);

  if (list.error) return jsonError(databaseErrorMessage(list.error), 500);
  if (facets.error) return jsonError(databaseErrorMessage(facets.error), 500);

  const facetRows = (facets.data ?? []).flatMap((row) => {
    const record = asRecord(row);
    const scheduledFor = stringField(record, "scheduled_for");
    const rowStatus = stringField(record, "status");
    return scheduledFor && rowStatus ? [{ scheduledFor, status: rowStatus }] : [];
  });

  return NextResponse.json({
    workouts: (list.data ?? []).map(normalizeWorkout).filter((workout) => workout !== null),
    page,
    pageSize: PAGE_SIZE,
    total: list.count ?? 0,
    counts: computeCounts(facetRows, { when, status }, bounds),
  });
}

function normalizeWorkout(row: unknown) {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const scheduledFor = stringField(record, "scheduled_for");
  const status = stringField(record, "status");
  if (!record || !id || !scheduledFor || !status) return null;
  const workout = asRecord(firstRelation(record.workouts));
  const source = workoutSourceFromRow(record);
  const duration = positiveNumber(workout?.estimated_duration_minutes);
  return {
    id,
    name: stringField(workout, "name") || "Workout",
    scheduledFor,
    status,
    durationMinutes: duration,
    programName: source.programName,
    givenBy: source.givenBy,
  };
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
