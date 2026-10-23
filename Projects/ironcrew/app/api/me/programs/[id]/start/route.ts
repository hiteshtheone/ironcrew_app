import { NextResponse } from "next/server";

import { activeProgramConflict, isActiveProgramExistsError } from "@/lib/api/active-programs";
import {
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
import { requireClientAccount } from "@/lib/api/signed-in-client";
import { isGoalType } from "@/lib/plans/constants";

type RouteContext = { params: Promise<{ id: string }> };

/** A client starts one of their own programs for themselves. */
export async function POST(request: Request, context: RouteContext) {
  const { id: programId } = await context.params;
  if (!isUuid(programId)) return jsonError("Program id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const input = parsedBody.body;
  const startsOn = asTrimmedString(input.starts_on);
  const goalTitle = asTrimmedString(input.goal_title);
  const goalType = asTrimmedString(input.goal_type);

  if (startsOn === undefined || goalTitle === undefined || goalType === undefined) {
    return jsonError("Plan fields must be strings or null", 400);
  }
  if (startsOn == null || !isIsoDate(startsOn)) return jsonError("starts_on must be YYYY-MM-DD", 400);
  if (goalTitle && goalTitle.length > 160) {
    return jsonError("A goal title must be 160 characters or fewer", 400);
  }
  if (goalType && !isGoalType(goalType)) return jsonError("goal_type is not a recognized goal", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const account = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in account) return account.error;

  const { data, error } = await auth.supabase.rpc("start_own_program", {
    p_program_id: programId,
    p_starts_on: startsOn,
    p_goal_title: goalTitle,
    p_goal_type: goalType ?? "other",
    p_allow_overlap: input.confirmOverlap === true,
  });

  if (error) {
    if (isActiveProgramExistsError(error)) {
      return activeProgramConflict(auth.supabase, account.clientId);
    }
    return jsonError(databaseErrorMessage(error), rpcStatus(error.message));
  }

  return NextResponse.json(data, { status: 201 });
}
