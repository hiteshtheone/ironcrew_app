import type { SupabaseClient } from "@supabase/supabase-js";

import { databaseErrorMessage } from "@/lib/api/route-utils";
import { currentWeek } from "@/lib/dashboard/client-week";
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
  type WorkoutPage,
  type WorkoutRow,
} from "@/lib/dashboard/workout-filters";
import { WORKOUT_SOURCE_COLUMNS, workoutSourceFromRow } from "@/lib/dashboard/workout-source";

export type ListAssignedWorkoutsError = {
  message: string;
  status: number;
};

/**
 * Lists one client's workout assignments with the same filters, sort, and
 * counts the client Workouts tab uses. `timeZone` decides what "today" and
 * "this week" mean.
 */
export async function listAssignedWorkouts(
  supabase: SupabaseClient,
  input: { clientId: string; timeZone: string; searchParams: URLSearchParams },
): Promise<{ page: WorkoutPage } | { error: ListAssignedWorkoutsError }> {
  const when = input.searchParams.get("when") ?? DEFAULT_FILTERS.when;
  const status = input.searchParams.get("status") ?? DEFAULT_FILTERS.status;
  const sort = input.searchParams.get("sort") ?? DEFAULT_FILTERS.sort;
  const page = parsePage(input.searchParams.get("page"));

  if (!isWhenFilter(when)) {
    return { error: { message: "when must be all, past, present, future, this_week, last_week or next_week", status: 400 } };
  }
  if (!isStatusFilter(status)) {
    return { error: { message: "status must be finished, unfinished, cancelled or all", status: 400 } };
  }
  if (!isSortOrder(sort)) return { error: { message: "sort must be date_desc or date_asc", status: 400 } };
  if (page == null) return { error: { message: "page must be a whole number of 1 or greater", status: 400 } };

  const week = currentWeek(input.timeZone);
  const bounds: DateBounds = { today: week.today, weekStart: week.start, weekEnd: week.end };
  const range = whenRange(when, bounds);
  const ascending = sort === "date_asc";
  const from = (page - 1) * PAGE_SIZE;

  let listQuery = supabase
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
    .eq("client_id", input.clientId)
    .in("status", [...STATUS_GROUPS[status]]);

  if (range.gte) listQuery = listQuery.gte("scheduled_for", range.gte);
  if (range.lte) listQuery = listQuery.lte("scheduled_for", range.lte);

  // Lightweight rows used only to derive the faceted count badges.
  const countsQuery = supabase
    .from("workout_assignments")
    .select("scheduled_for, status")
    .eq("client_id", input.clientId);

  const [list, facets] = await Promise.all([
    listQuery
      .order("scheduled_for", { ascending })
      .order("id", { ascending })
      .range(from, from + PAGE_SIZE - 1),
    countsQuery,
  ]);

  if (list.error) return { error: { message: databaseErrorMessage(list.error), status: 500 } };
  if (facets.error) return { error: { message: databaseErrorMessage(facets.error), status: 500 } };

  const facetRows = (facets.data ?? []).flatMap((row) => {
    const record = asRecord(row);
    const scheduledFor = stringField(record, "scheduled_for");
    const rowStatus = stringField(record, "status");
    return scheduledFor && rowStatus ? [{ scheduledFor, status: rowStatus }] : [];
  });

  return {
    page: {
      workouts: (list.data ?? []).map(normalizeWorkout).filter((workout): workout is WorkoutRow => workout !== null),
      page,
      pageSize: PAGE_SIZE,
      total: list.count ?? 0,
      counts: computeCounts(facetRows, { when, status }, bounds),
    },
  };
}

function normalizeWorkout(row: unknown): WorkoutRow | null {
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
