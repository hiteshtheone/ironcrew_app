import { NextResponse } from "next/server";

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
  if (name === undefined) return jsonError("name must be a string", 400);
  if (name == null || name.length > 160) {
    return jsonError("An exercise name between 1 and 160 characters is required", 400);
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("exercises")
    .insert({ trainer_id: auth.user.id, name })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("An exercise with that name already exists", 409);
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}
