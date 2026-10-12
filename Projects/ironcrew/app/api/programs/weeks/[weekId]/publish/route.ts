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
  rpcStatus,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ weekId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { weekId } = await context.params;
  if (!isUuid(weekId)) return jsonError("Week id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const weekStart = asTrimmedString(parsedBody.body.week_start);
  if (weekStart == null || weekStart === undefined || !isIsoDate(weekStart)) {
    return jsonError("week_start must be YYYY-MM-DD", 400);
  }

  let clientIds: string[] | null = null;
  if (parsedBody.body.client_ids != null) {
    if (!Array.isArray(parsedBody.body.client_ids)) {
      return jsonError("client_ids must be an array of UUIDs", 400);
    }
    const ids = parsedBody.body.client_ids.filter((value): value is string => typeof value === "string");
    if (ids.length !== parsedBody.body.client_ids.length || ids.some((id) => !isUuid(id))) {
      return jsonError("client_ids must be an array of UUIDs", 400);
    }
    clientIds = ids;
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.rpc("publish_program_week", {
    p_program_week_id: weekId,
    p_week_start: weekStart,
    p_client_ids: clientIds,
  });

  if (error) {
    return jsonError(databaseErrorMessage(error), rpcStatus(error.message));
  }

  return NextResponse.json(data);
}
