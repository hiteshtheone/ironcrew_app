import { NextResponse } from "next/server";

import { authorizeLiveWorkoutEdit } from "@/lib/api/live-workout-edit";
import { requireClientAccount } from "@/lib/api/signed-in-client";
import {
  databaseErrorMessage,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";
import { exerciseUsableForLiveWorkout, parseAddExercise } from "@/lib/dashboard/live-workout";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Assignment id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = parseAddExercise(parsedBody.body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const editable = await authorizeLiveWorkoutEdit(auth.supabase, client.clientId, id);
  if ("error" in editable) return editable.error;

  const { data: exercise, error: exerciseError } = await auth.supabase
    .from("exercises")
    .select("id, owner_client_id, trainer_id")
    .eq("id", parsed.exerciseId)
    .maybeSingle();

  if (exerciseError) {
    const status = /row-level security/i.test(exerciseError.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(exerciseError), status);
  }

  const usable = exerciseUsableForLiveWorkout(
    exercise
      ? { ownerClientId: exercise.owner_client_id, trainerId: exercise.trainer_id }
      : null,
    client.clientId,
  );
  if (!usable.ok) return jsonError(usable.message, usable.status);

  const { data: lastBlock, error: positionError } = await auth.supabase
    .from("workout_blocks")
    .select("position")
    .eq("workout_id", editable.workoutId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (positionError) {
    const status = /row-level security/i.test(positionError.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(positionError), status);
  }

  const position = (typeof lastBlock?.position === "number" ? lastBlock.position : 0) + 1;
  const { data: block, error: insertError } = await auth.supabase
    .from("workout_blocks")
    .insert({
      workout_id: editable.workoutId,
      exercise_id: parsed.exerciseId,
      block_type: "exercise",
      position,
    })
    .select("id, exercise_id, position")
    .single();

  if (insertError || !block) {
    if (insertError?.code === "23505") {
      return jsonError("Couldn't add that exercise. Try again.", 409);
    }
    const status = insertError && /row-level security/i.test(insertError.message) ? 403 : 500;
    return jsonError(insertError ? databaseErrorMessage(insertError) : "Couldn't add that exercise", status);
  }

  return NextResponse.json(block, { status: 201 });
}
