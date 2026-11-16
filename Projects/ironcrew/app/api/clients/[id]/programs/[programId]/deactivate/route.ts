import { NextResponse } from "next/server";

import {
  databaseErrorMessage,
  isUuid,
  jsonError,
  requireUser,
  rpcStatus,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string; programId: string }> };

/** A trainer stops a program they assigned to a client they manage. */
export async function POST(_request: Request, context: RouteContext) {
  const { id: clientId, programId } = await context.params;
  if (!isUuid(clientId)) return jsonError("Client id must be a UUID", 400);
  if (!isUuid(programId)) return jsonError("Program id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.rpc("deactivate_program", {
    p_program_id: programId,
    p_client_id: clientId,
  });

  if (error) return jsonError(databaseErrorMessage(error), rpcStatus(error.message));

  return NextResponse.json(data);
}
