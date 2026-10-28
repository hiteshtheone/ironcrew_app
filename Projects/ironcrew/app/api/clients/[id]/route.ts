import { NextResponse } from "next/server";

import { databaseErrorMessage, isForeignKeyError, isUuid, jsonError, requireUser } from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Client id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.from("clients").delete().eq("id", id).select("id").maybeSingle();
  if (error) {
    if (isForeignKeyError(error)) {
      return jsonError("This client still has records that can't be removed, so they can't be deleted.", 409);
    }
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }
  if (!data) return jsonError("Client not found", 404);

  return NextResponse.json({ id: data.id });
}
