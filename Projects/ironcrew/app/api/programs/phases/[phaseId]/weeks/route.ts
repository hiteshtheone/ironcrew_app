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

type RouteContext = { params: Promise<{ phaseId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { phaseId } = await context.params;
  if (!isUuid(phaseId)) return jsonError("Phase id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const name = asTrimmedString(parsedBody.body.name);
  if (name === undefined) return jsonError("name must be a string or null", 400);
  if (name && name.length > 160) return jsonError("Week name must be 160 characters or fewer", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: latest, error: latestError } = await auth.supabase
    .from("program_weeks")
    .select("week_number")
    .eq("program_phase_id", phaseId)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) return jsonError(databaseErrorMessage(latestError), 500);

  const weekNumber = (typeof latest?.week_number === "number" ? latest.week_number : 0) + 1;
  const { data, error } = await auth.supabase
    .from("program_weeks")
    .insert({
      program_phase_id: phaseId,
      week_number: weekNumber,
      name,
    })
    .select("id, program_phase_id, week_number, name")
    .single();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}
