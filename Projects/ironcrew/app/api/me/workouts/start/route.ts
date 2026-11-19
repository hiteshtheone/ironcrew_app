import { NextResponse } from "next/server";

import { requireClientAccount } from "@/lib/api/signed-in-client";
import { databaseErrorMessage, jsonError, readJson, requireUser } from "@/lib/api/route-utils";
import { parseStartWorkout } from "@/lib/dashboard/live-workout";

export async function POST(request: Request) {
  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = parseStartWorkout(parsedBody.body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const { data: workout, error: workoutError } = await auth.supabase
    .from("workouts")
    .insert({
      owner_client_id: client.clientId,
      name: parsed.value.name,
      is_template: true,
    })
    .select("id, name")
    .single();

  if (workoutError || !workout) {
    const status = workoutError && /row-level security/i.test(workoutError.message) ? 403 : 500;
    return jsonError(workoutError ? databaseErrorMessage(workoutError) : "Couldn't start this workout", status);
  }

  const { data: assignment, error: assignmentError } = await auth.supabase
    .from("workout_assignments")
    .insert({
      client_id: client.clientId,
      workout_id: workout.id,
      assigned_by_client_id: client.clientId,
      assigned_by_trainer_id: null,
      scheduled_for: parsed.value.scheduledFor,
      status: "in_progress",
    })
    .select("id, client_id, workout_id, scheduled_for, status")
    .single();

  if (assignmentError || !assignment) {
    await auth.supabase.from("workouts").delete().eq("id", workout.id);
    const status = assignmentError && /row-level security/i.test(assignmentError.message) ? 403 : 500;
    return jsonError(
      assignmentError ? databaseErrorMessage(assignmentError) : "Couldn't start this workout",
      status,
    );
  }

  return NextResponse.json({ ...assignment, name: workout.name }, { status: 201 });
}
