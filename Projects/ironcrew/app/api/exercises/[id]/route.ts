import { NextResponse } from "next/server";

import {
  databaseErrorMessage,
  isForeignKeyError,
  jsonError,
  readJson,
  requireUser,
  isUuid,
} from "@/lib/api/route-utils";
import { exerciseWriteError, parseExerciseWrite } from "@/lib/exercises/input";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Exercise id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = parseExerciseWrite(parsedBody.body, "update");
  if ("error" in parsed) return parsed.error;

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const exercise = parsed.value;
  const { data, error } = await auth.supabase
    .from("exercises")
    .update({
      name: exercise.name,
      tracking_type: exercise.trackingType,
      tracking_parameters: exercise.trackingParameters,
      primary_muscle_group: exercise.primaryMuscleGroup,
      secondary_muscle_group: exercise.secondaryMuscleGroup,
    })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();

  if (error) return exerciseWriteError(error);
  if (!data) return jsonError("Exercise not found", 404);

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Exercise id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.from("exercises").delete().eq("id", id).select("id").maybeSingle();
  if (error) {
    if (isForeignKeyError(error)) {
      return jsonError("This exercise has logged results, so it can't be deleted.", 409);
    }
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }
  if (!data) return jsonError("Exercise not found", 404);

  return NextResponse.json({ id: data.id });
}
