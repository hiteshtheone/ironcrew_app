import { NextResponse } from "next/server";

import {
  asTrimmedString,
  databaseErrorMessage,
  isIsoDate,
  isRecord,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";
import { requireClientAccount } from "@/lib/api/signed-in-client";
import { GOAL_TYPE_LABELS, isGoalType } from "@/lib/plans/constants";

/** A client adds a goal for themselves. */
export async function POST(request: Request) {
  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const input = parsedBody.body;
  const goalType = asTrimmedString(input.goal_type);
  const title = asTrimmedString(input.title);
  const targetDate = asTrimmedString(input.target_date);
  const notes = asTrimmedString(input.notes);

  if (goalType === undefined || title === undefined || targetDate === undefined || notes === undefined) {
    return jsonError("Goal fields must be strings or null", 400);
  }
  if (goalType == null || !isGoalType(goalType)) return jsonError("goal_type is not a recognized goal", 400);
  if (title && title.length > 160) return jsonError("A goal title must be 160 characters or fewer", 400);
  if (targetDate && !isIsoDate(targetDate)) return jsonError("target_date must be YYYY-MM-DD", 400);
  if (notes && notes.length > 2000) return jsonError("Notes must be 2000 characters or fewer", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const account = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in account) return account.error;

  const { data, error } = await auth.supabase
    .from("goals")
    .insert({
      client_id: account.clientId,
      title: title ?? GOAL_TYPE_LABELS[goalType],
      goal_type: goalType,
      status: "active",
      target_date: targetDate,
      notes,
    })
    .select("id, title, goal_type, status, target_date")
    .single();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}
