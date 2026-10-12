import { NextResponse } from "next/server";

import {
  asOptionalNumber,
  asTrimmedString,
  databaseErrorMessage,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ weekId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { weekId } = await context.params;
  if (!isUuid(weekId)) return jsonError("Week id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const workoutId = asTrimmedString(parsedBody.body.workout_id);
  const dayNumber = asOptionalNumber(parsedBody.body.day_number);
  const positionValue = asOptionalNumber(parsedBody.body.position);

  if (workoutId === undefined) return jsonError("workout_id must be a string", 400);
  if (workoutId == null || !isUuid(workoutId)) return jsonError("workout_id must be a UUID", 400);
  if (dayNumber == null || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
    return jsonError("day_number must be an integer from 1 to 7", 400);
  }
  if (
    positionValue === undefined ||
    (positionValue !== null && (!Number.isInteger(positionValue) || positionValue < 1))
  ) {
    return jsonError("position must be a positive integer", 400);
  }
  const position = positionValue ?? 1;

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: existing, error: existingError } = await auth.supabase
    .from("program_workouts")
    .select("id")
    .eq("program_week_id", weekId)
    .eq("day_number", dayNumber)
    .eq("position", position)
    .maybeSingle();

  if (existingError) return jsonError(databaseErrorMessage(existingError), 500);

  if (existing?.id) {
    const { data, error } = await auth.supabase
      .from("program_workouts")
      .update({ workout_id: workoutId })
      .eq("id", existing.id)
      .select("id, program_week_id, workout_id, day_number, position")
      .single();

    if (error) {
      const status = /row-level security/i.test(error.message) ? 403 : 500;
      return jsonError(databaseErrorMessage(error), status);
    }
    return NextResponse.json(data);
  }

  const { data, error } = await auth.supabase
    .from("program_workouts")
    .insert({
      program_week_id: weekId,
      workout_id: workoutId,
      day_number: dayNumber,
      position,
    })
    .select("id, program_week_id, workout_id, day_number, position")
    .single();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { weekId } = await context.params;
  if (!isUuid(weekId)) return jsonError("Week id must be a UUID", 400);

  const url = new URL(request.url);
  const dayNumber = Number(url.searchParams.get("day_number"));
  const position = Number(url.searchParams.get("position") ?? "1");
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
    return jsonError("day_number must be an integer from 1 to 7", 400);
  }
  if (!Number.isInteger(position) || position < 1) {
    return jsonError("position must be a positive integer", 400);
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { error } = await auth.supabase
    .from("program_workouts")
    .delete()
    .eq("program_week_id", weekId)
    .eq("day_number", dayNumber)
    .eq("position", position);

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json({ ok: true });
}
