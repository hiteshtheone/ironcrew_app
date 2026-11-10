import type { SupabaseClient } from "@supabase/supabase-js";

import { databaseErrorMessage } from "@/lib/api/route-utils";
import { isAssignmentStatus, type AssignmentStatus } from "@/lib/dashboard/client-week";
import { WORKOUT_SOURCE_COLUMNS, workoutSourceFromRow } from "@/lib/dashboard/workout-source";

const PAGE_SIZE = 500;

export type CalendarEntry = {
  id: string;
  name: string;
  scheduledFor: string;
  status: AssignmentStatus;
  durationMinutes: number | null;
  programName: string | null;
  givenBy: string;
  clientName: string | null;
};

export type LoadCalendarError = {
  message: string;
  status: number;
};

/**
 * Assignments between `from` and `to`, inclusive.
 * Pass `clientId` for one client. Omit it to use the caller's row-level access,
 * which is how a trainer sees every client they manage.
 */
export async function loadCalendarAssignments(
  supabase: SupabaseClient,
  input: { from: string; to: string; clientId?: string },
): Promise<{ workouts: CalendarEntry[] } | { error: LoadCalendarError }> {
  const workouts: CalendarEntry[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("workout_assignments")
      .select(
        `
        id,
        scheduled_for,
        status,
        ${WORKOUT_SOURCE_COLUMNS},
        workouts ( name, estimated_duration_minutes ),
        clients!workout_assignments_client_id_fkey ( first_name, last_name )
      `,
      )
      .gte("scheduled_for", input.from)
      .lte("scheduled_for", input.to)
      .order("scheduled_for", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (input.clientId) query = query.eq("client_id", input.clientId);

    const { data, error } = await query;
    if (error) return { error: { message: databaseErrorMessage(error), status: 500 } };

    const rows = data ?? [];
    for (const row of rows) {
      const workout = normalizeEntry(row);
      if (workout) workouts.push(workout);
    }
    if (rows.length < PAGE_SIZE) break;
  }

  return { workouts };
}

function normalizeEntry(row: unknown): CalendarEntry | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const scheduledFor = stringField(record, "scheduled_for");
  const status = stringField(record, "status");
  if (!record || !id || !scheduledFor || !status || !isAssignmentStatus(status)) return null;

  const workout = asRecord(firstRelation(record.workouts));
  const client = asRecord(firstRelation(record.clients));
  const source = workoutSourceFromRow(record);
  const clientName = [stringField(client, "first_name"), stringField(client, "last_name")].filter(Boolean).join(" ");

  return {
    id,
    name: stringField(workout, "name") || "Workout",
    scheduledFor,
    status,
    durationMinutes: positiveNumber(workout?.estimated_duration_minutes),
    programName: source.programName,
    givenBy: source.givenBy,
    clientName: clientName || null,
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
