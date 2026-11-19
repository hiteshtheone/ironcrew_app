import type { SupabaseClient } from "@supabase/supabase-js";

import { liveWorkoutBlockDenial } from "@/lib/dashboard/live-workout";
import { databaseErrorMessage, jsonError } from "@/lib/api/route-utils";

export async function authorizeLiveWorkoutEdit(
  supabase: SupabaseClient,
  callerClientId: string,
  assignmentId: string,
) {
  const { data, error } = await supabase
    .from("workout_assignments")
    .select("id, client_id, assigned_by_client_id, workout_id, workouts(owner_client_id)")
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return { error: jsonError(databaseErrorMessage(error), status) };
  }
  if (!data) return { error: jsonError("Workout assignment not found", 404) };

  const record = asRecord(data);
  const workout = asRecord(firstRelation(record?.workouts));
  const workoutId = stringField(record, "workout_id");
  if (!workoutId) return { error: jsonError("Workout assignment not found", 404) };

  const { count, error: programError } = await supabase
    .from("program_workouts")
    .select("id", { count: "exact", head: true })
    .eq("workout_id", workoutId);

  if (programError) {
    const status = /row-level security/i.test(programError.message) ? 403 : 500;
    return { error: jsonError(databaseErrorMessage(programError), status) };
  }

  const denial = liveWorkoutBlockDenial({
    callerClientId,
    assignmentClientId: stringField(record, "client_id"),
    assignedByClientId: stringField(record, "assigned_by_client_id"),
    ownerClientId: stringField(workout, "owner_client_id"),
    onProgram: (count ?? 0) > 0,
  });
  if (denial) return { error: jsonError(denial.message, denial.status) };

  return { workoutId };
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
