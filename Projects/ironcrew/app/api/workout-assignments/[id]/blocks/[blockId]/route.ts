import { NextResponse } from "next/server";

import { authorizeLiveWorkoutEdit } from "@/lib/api/live-workout-edit";
import { requireClientAccount } from "@/lib/api/signed-in-client";
import { databaseErrorMessage, isUuid, jsonError, requireUser } from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string; blockId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, blockId } = await context.params;
  if (!isUuid(id)) return jsonError("Assignment id must be a UUID", 400);
  if (!isUuid(blockId)) return jsonError("Block id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const editable = await authorizeLiveWorkoutEdit(auth.supabase, client.clientId, id);
  if ("error" in editable) return editable.error;

  const { data, error } = await auth.supabase
    .from("workout_blocks")
    .delete()
    .eq("id", blockId)
    .eq("workout_id", editable.workoutId)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }
  if (!data) return jsonError("That exercise is not on this workout", 404);

  return NextResponse.json({ id: data.id });
}
