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

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: clientId } = await context.params;
  if (!isUuid(clientId)) return jsonError("Client id must be a UUID", 400);

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

  const { data, error } = await auth.supabase
    .from("workout_assignments")
    .insert({
      client_id: clientId,
      workout_id: workoutId,
      assigned_by_trainer_id: auth.user.id,
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
