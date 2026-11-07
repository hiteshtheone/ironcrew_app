import { NextResponse } from "next/server";

import { forSelfRequested } from "@/lib/api/owner";
import {
  databaseErrorMessage,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
  rpcStatus,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Program id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.rpc("duplicate_program", {
    p_program_id: id,
    p_for_self: forSelfRequested(parsedBody.body),
  });
  if (error) return jsonError(databaseErrorMessage(error), rpcStatus(error.message));

  return NextResponse.json(data, { status: 201 });
}
