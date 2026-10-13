import { NextResponse } from "next/server";

import {
  databaseErrorMessage,
  isUuid,
  jsonError,
  requireUser,
  rpcStatus,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Program id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.rpc("duplicate_program", { p_program_id: id });
  if (error) return jsonError(databaseErrorMessage(error), rpcStatus(error.message));

  return NextResponse.json(data, { status: 201 });
}
