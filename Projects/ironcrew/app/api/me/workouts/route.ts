import { NextResponse } from "next/server";

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
import { requireClientAccount } from "@/lib/api/signed-in-client";
import { listAssignedWorkouts } from "@/lib/dashboard/list-assigned-workouts";

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
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const listed = await listAssignedWorkouts(auth.supabase, {
    clientId: client.clientId,
    timeZone: client.timeZone,
    searchParams: new URL(request.url).searchParams,
  });
  if ("error" in listed) return jsonError(listed.error.message, listed.error.status);
  return NextResponse.json(listed.page);
}
