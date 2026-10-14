import { NextResponse } from "next/server";

import {
  asTrimmedString,
  databaseErrorMessage,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";
import { isClientAssignmentStatus } from "@/lib/dashboard/client-week";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Assignment id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const status = asTrimmedString(parsedBody.body.status);
  if (status === undefined) return jsonError("status must be a string", 400);
  if (status == null || !isClientAssignmentStatus(status)) {
    return jsonError("status must be scheduled, in_progress, completed, or skipped", 400);
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("workout_assignments")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    const failure = /row-level security|42501|cannot update a cancelled|can only update workout status|cannot cancel/i.test(
      error.message,
    )
      ? 403
      : 500;
    return jsonError(databaseErrorMessage(error), failure);
  }
  if (!data) return jsonError("Workout assignment not found", 404);

  return NextResponse.json(data);
}
