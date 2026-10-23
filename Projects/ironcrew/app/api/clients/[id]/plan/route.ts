import { NextResponse } from "next/server";

import { activeProgramConflict, isActiveProgramExistsError } from "@/lib/api/active-programs";
import {
  asOptionalNumber,
  asTrimmedString,
  databaseErrorMessage,
  isIsoDate,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
  rpcStatus,
} from "@/lib/api/route-utils";
import { isGoalType } from "@/lib/plans/constants";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: clientId } = await context.params;
  if (!isUuid(clientId)) return jsonError("Client id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const input = parsedBody.body;
  const title = asTrimmedString(input.title);
  const goalType = asTrimmedString(input.goal_type);
  const targetUnit = asTrimmedString(input.target_unit);
  const targetDate = asTrimmedString(input.target_date);
  const notes = asTrimmedString(input.notes);
  const programId = asTrimmedString(input.program_id);
  const startsOn = asTrimmedString(input.starts_on);
  const targetValue = asOptionalNumber(input.target_value);

  if (
    title === undefined ||
    goalType === undefined ||
    targetUnit === undefined ||
    targetDate === undefined ||
    notes === undefined ||
    programId === undefined ||
    startsOn === undefined
  ) {
    return jsonError("Plan fields must be strings or null", 400);
  }
  if (title == null || title.length > 160) {
    return jsonError("A goal title between 1 and 160 characters is required", 400);
  }
  if (goalType == null || !isGoalType(goalType)) {
    return jsonError("goal_type is not a recognized goal", 400);
  }
  if (targetValue === undefined || (targetValue !== null && targetValue < 0)) {
    return jsonError("target_value must be a number that is zero or greater", 400);
  }
  if (targetUnit && targetUnit.length > 40) return jsonError("target_unit must be 40 characters or fewer", 400);
  if (targetDate && !isIsoDate(targetDate)) return jsonError("target_date must be YYYY-MM-DD", 400);
  if (notes && notes.length > 10000) return jsonError("notes must be 10000 characters or fewer", 400);
  if (programId == null || !isUuid(programId)) return jsonError("program_id must be a UUID", 400);
  if (startsOn == null || !isIsoDate(startsOn)) return jsonError("starts_on must be YYYY-MM-DD", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.rpc("start_client_plan", {
    p_client_id: clientId,
    p_title: title,
    p_goal_type: goalType,
    p_target_value: targetValue,
    p_target_unit: targetUnit,
    p_target_date: targetDate,
    p_notes: notes,
    p_program_id: programId,
    p_starts_on: startsOn,
    p_allow_overlap: input.confirmOverlap === true,
  });

  if (error) {
    if (isActiveProgramExistsError(error)) {
      return activeProgramConflict(auth.supabase, clientId);
    }
    return jsonError(databaseErrorMessage(error), rpcStatus(error.message));
  }

  return NextResponse.json(data, { status: 201 });
}
