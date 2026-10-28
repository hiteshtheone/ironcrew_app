import { NextResponse } from "next/server";

import {
  asOptionalNumber,
  asTrimmedString,
  databaseErrorMessage,
  isForeignKeyError,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
  rpcStatus,
} from "@/lib/api/route-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Workout id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const name = asTrimmedString(parsedBody.body.name);
  const description = asTrimmedString(parsedBody.body.description);
  const duration = asOptionalNumber(parsedBody.body.estimated_duration_minutes);
  const blocks = parsedBody.body.blocks;

  if (name === undefined || description === undefined) {
    return jsonError("Workout fields must be strings or null", 400);
  }
  if (name == null || name.length > 160) {
    return jsonError("A workout name between 1 and 160 characters is required", 400);
  }
  if (duration === undefined || (duration !== null && (!Number.isInteger(duration) || duration <= 0))) {
    return jsonError("estimated_duration_minutes must be a positive integer or null", 400);
  }
  if (!Array.isArray(blocks)) return jsonError("blocks must be an array", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.rpc("save_workout", {
    p_workout_id: id,
    p_name: name,
    p_description: description,
    p_duration_minutes: duration,
    p_blocks: blocks,
  });

  if (error) return jsonError(databaseErrorMessage(error), rpcStatus(error.message));

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Workout id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.from("workouts").delete().eq("id", id).select("id").maybeSingle();
  if (error) {
    if (isForeignKeyError(error)) {
      return jsonError("This workout is still on a program or a calendar, so it can't be deleted.", 409);
    }
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }
  if (!data) return jsonError("Workout not found", 404);

  return NextResponse.json({ id: data.id });
}
