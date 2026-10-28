import { NextResponse } from "next/server";

import {
  asOptionalNumber,
  asTrimmedString,
  databaseErrorMessage,
  isForeignKeyError,
  isIsoDate,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";
import { isGoalStatus, isGoalType } from "@/lib/plans/constants";

type RouteContext = { params: Promise<{ id: string; goalId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id: clientId, goalId } = await context.params;
  if (!isUuid(clientId)) return jsonError("Client id must be a UUID", 400);
  if (!isUuid(goalId)) return jsonError("Goal id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const input = parsedBody.body;
  const title = asTrimmedString(input.title);
  const goalType = asTrimmedString(input.goal_type);
  const status = asTrimmedString(input.status);
  const targetUnit = asTrimmedString(input.target_unit);
  const targetDate = asTrimmedString(input.target_date);
  const notes = asTrimmedString(input.notes);
  const targetValue = asOptionalNumber(input.target_value);

  if (
    title === undefined ||
    goalType === undefined ||
    status === undefined ||
    targetUnit === undefined ||
    targetDate === undefined ||
    notes === undefined
  ) {
    return jsonError("Goal fields must be strings or null", 400);
  }
  if (title == null || title.length > 160) {
    return jsonError("A goal title between 1 and 160 characters is required", 400);
  }
  if (goalType == null || !isGoalType(goalType)) {
    return jsonError("goal_type is not a recognized goal", 400);
  }
  if (status == null || !isGoalStatus(status)) {
    return jsonError("status is not a recognized goal status", 400);
  }
  if (targetValue === undefined || (targetValue !== null && targetValue < 0)) {
    return jsonError("target_value must be a number that is zero or greater", 400);
  }
  if (targetUnit && targetUnit.length > 40) return jsonError("target_unit must be 40 characters or fewer", 400);
  if (targetDate && !isIsoDate(targetDate)) return jsonError("target_date must be YYYY-MM-DD", 400);
  if (notes && notes.length > 10000) return jsonError("notes must be 10000 characters or fewer", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("goals")
    .update({
      title,
      goal_type: goalType,
      status,
      target_value: targetValue,
      target_unit: targetUnit,
      target_date: targetDate,
      notes,
    })
    .eq("id", goalId)
    .eq("client_id", clientId)
    .select("id, title, goal_type, status, target_value, target_unit, target_date, notes")
    .maybeSingle();

  if (error) {
    const failure = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), failure);
  }
  if (!data) return jsonError("Goal not found", 404);

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: clientId, goalId } = await context.params;
  if (!isUuid(clientId)) return jsonError("Client id must be a UUID", 400);
  if (!isUuid(goalId)) return jsonError("Goal id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("goals")
    .delete()
    .eq("id", goalId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isForeignKeyError(error)) {
      return jsonError("This goal is still in use, so it can't be deleted.", 409);
    }
    const failure = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), failure);
  }
  if (!data) return jsonError("Goal not found", 404);

  return NextResponse.json({ id: data.id });
}
