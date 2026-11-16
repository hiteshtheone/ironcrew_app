import { NextResponse } from "next/server";

import {
  databaseErrorMessage,
  isUuid,
  jsonError,
  requireUser,
  rpcStatus,
} from "@/lib/api/route-utils";
import { requireClientAccount } from "@/lib/api/signed-in-client";

type RouteContext = { params: Promise<{ id: string }> };

/** A client stops a program they started for themselves. */
export async function POST(_request: Request, context: RouteContext) {
  const { id: programId } = await context.params;
  if (!isUuid(programId)) return jsonError("Program id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const account = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in account) return account.error;

  const { data, error } = await auth.supabase.rpc("deactivate_program", {
    p_program_id: programId,
    p_client_id: account.clientId,
  });

  if (error) return jsonError(databaseErrorMessage(error), rpcStatus(error.message));

  return NextResponse.json(data);
}
