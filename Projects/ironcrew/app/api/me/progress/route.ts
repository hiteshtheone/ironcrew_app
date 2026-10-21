import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { requireClientAccount } from "@/lib/api/signed-in-client";
import { databaseErrorMessage, isIsoDate, jsonError, requireUser } from "@/lib/api/route-utils";
import {
  buildClientProgress,
  type ProgressAssignment,
  type ProgressSet,
} from "@/lib/dashboard/client-progress";
import { addDays, currentWeek, formatWeekday, isAssignmentStatus } from "@/lib/dashboard/client-week";

const PAGE_SIZE = 500;

export async function GET(request: Request) {
  const weekParam = new URL(request.url).searchParams.get("week");
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const current = currentWeek(client.timeZone);
  const weekStart = weekParam ?? current.start;
  if (!isIsoDate(weekStart) || formatWeekday(weekStart) !== "Mon") {
    return jsonError("week must be a Monday in YYYY-MM-DD", 400);
  }
  if (weekStart > current.start) return jsonError("week cannot be in the future", 400);

  const rangeStart = addDays(weekStart, -7 * 11);
  const rangeEnd = addDays(weekStart, 6);
  const loaded = await loadAssignments(auth.supabase, client.clientId, rangeStart, rangeEnd);
  if ("error" in loaded) return loaded.error;

  return NextResponse.json(buildClientProgress(weekStart, loaded.assignments, loaded.sets));
}

async function loadAssignments(
  supabase: SupabaseClient,
  clientId: string,
  rangeStart: string,
  rangeEnd: string,
) {
  const assignments: ProgressAssignment[] = [];
  const sets: ProgressSet[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("workout_assignments")
      .select(
        `
        id,
        scheduled_for,
        status,
        workout_sessions (
          exercise_results (
            repetitions,
            load,
            load_unit,
            distance_meters,
            exercises ( name, equipment, primary_muscle_group )
          )
        )
      `,
      )
      .eq("client_id", clientId)
      .gte("scheduled_for", rangeStart)
      .lte("scheduled_for", rangeEnd)
      .order("scheduled_for", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { error: jsonError(databaseErrorMessage(error), 500) };
    const rows = data ?? [];
    for (const row of rows) collectRow(row, assignments, sets);
    if (rows.length < PAGE_SIZE) break;
  }

  return { assignments, sets };
}

function collectRow(row: unknown, assignments: ProgressAssignment[], sets: ProgressSet[]) {
  const record = asRecord(row);
  const scheduledFor = stringField(record, "scheduled_for");
  const status = stringField(record, "status");
  if (!record || !scheduledFor || !status || !isAssignmentStatus(status)) return;
  assignments.push({ scheduledFor, status });

  const session = asRecord(firstRelation(record.workout_sessions));
  for (const result of relationList(session?.exercise_results)) {
    const set = asRecord(result);
    if (!set) continue;
    const exercise = asRecord(firstRelation(set.exercises));
    sets.push({
      scheduledFor,
      repetitions: nonNegative(set.repetitions),
      load: nonNegative(set.load),
      loadUnit: stringField(set, "load_unit"),
      distanceMeters: nonNegative(set.distance_meters),
      exerciseName: stringField(exercise, "name"),
      equipment: stringField(exercise, "equipment"),
      muscleGroup: stringField(exercise, "primary_muscle_group"),
    });
  }
}

function nonNegative(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  return parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function relationList(value: unknown) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}
