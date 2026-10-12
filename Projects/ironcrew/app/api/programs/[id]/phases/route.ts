import { NextResponse } from "next/server";

import {
  asTrimmedString,
  databaseErrorMessage,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: programId } = await context.params;
  if (!isUuid(programId)) return jsonError("Program id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const name = asTrimmedString(parsedBody.body.name);
  const description = asTrimmedString(parsedBody.body.description);
  if (name === undefined || description === undefined) {
    return jsonError("Phase fields must be strings or null", 400);
  }
  if (name == null || name.length > 160) {
    return jsonError("A phase name between 1 and 160 characters is required", 400);
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: latest, error: latestError } = await auth.supabase
    .from("program_phases")
    .select("position")
    .eq("program_id", programId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) return jsonError(databaseErrorMessage(latestError), 500);

  const position = (typeof latest?.position === "number" ? latest.position : 0) + 1;
  const { data, error } = await auth.supabase
    .from("program_phases")
    .insert({
      program_id: programId,
      name,
      description,
      position,
    })
    .select("id, program_id, name, position, description")
    .single();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}
