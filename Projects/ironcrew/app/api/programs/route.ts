import { NextResponse } from "next/server";

import { resolveOwner } from "@/lib/api/owner";
import {
  asTrimmedString,
  databaseErrorMessage,
  isRecord,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";

export async function POST(request: Request) {
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

  const resolved = await resolveOwner(auth.supabase, auth.user.id);
  if ("error" in resolved) return resolved.error;

  const { data, error } = await auth.supabase
    .from("programs")
    .insert({
      ...resolved.owner,
      name,
      description,
      status: "active",
    })
    .select("id, name, description, status")
    .single();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}
