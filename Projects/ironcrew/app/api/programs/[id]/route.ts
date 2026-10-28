import { NextResponse } from "next/server";

import {
  asTrimmedString,
  databaseErrorMessage,
  isForeignKeyError,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Program id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const name = asTrimmedString(parsedBody.body.name);
  const description = asTrimmedString(parsedBody.body.description);
  if (name === undefined || description === undefined) {
    return jsonError("Program fields must be strings or null", 400);
  }
  if (name == null || name.length > 160) {
    return jsonError("A program name between 1 and 160 characters is required", 400);
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("programs")
    .update({ name, description })
    .eq("id", id)
    .select("id, name, description, status")
    .maybeSingle();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }
  if (!data) return jsonError("Program not found", 404);

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Program id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.from("programs").delete().eq("id", id).select("id").maybeSingle();
  if (error) {
    if (isForeignKeyError(error)) {
      return jsonError("This program is still in use, so it can't be deleted.", 409);
    }
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }
  if (!data) return jsonError("Program not found", 404);

  return NextResponse.json({ id: data.id });
}
