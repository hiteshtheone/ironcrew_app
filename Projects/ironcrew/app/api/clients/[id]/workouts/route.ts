import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asTrimmedString,
  databaseErrorMessage,
  isIsoDate,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";
import { resolveTimeZone } from "@/lib/dashboard/client-week";
import { listAssignedWorkouts } from "@/lib/dashboard/list-assigned-workouts";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id: clientId } = await context.params;
  if (!isUuid(clientId)) return jsonError("Client id must be a UUID", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const access = await clientTimeZoneForTrainer(auth.supabase, auth.user.id, clientId);
  if ("error" in access) return access.error;

  const listed = await listAssignedWorkouts(auth.supabase, {
    clientId,
    timeZone: access.timeZone,
    searchParams: new URL(request.url).searchParams,
  });
  if ("error" in listed) return jsonError(listed.error.message, listed.error.status);
  return NextResponse.json(listed.page);
}

export async function POST(request: Request, context: RouteContext) {
  const { id: clientId } = await context.params;
  if (!isUuid(clientId)) return jsonError("Client id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const input = parsedBody.body;
  const workoutId = asTrimmedString(input.workout_id);
  const scheduledFor = asTrimmedString(input.scheduled_for);
  const notes = asTrimmedString(input.notes);

  if (workoutId === undefined || scheduledFor === undefined || notes === undefined) {
    return jsonError("Workout fields must be strings or null", 400);
  }
  if (workoutId == null || !isUuid(workoutId)) return jsonError("workout_id must be a UUID", 400);
  if (scheduledFor == null || !isIsoDate(scheduledFor)) return jsonError("scheduled_for must be YYYY-MM-DD", 400);
  if (notes && notes.length > 10000) return jsonError("notes must be 10000 characters or fewer", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("workout_assignments")
    .insert({
      client_id: clientId,
      workout_id: workoutId,
      assigned_by_trainer_id: auth.user.id,
      scheduled_for: scheduledFor,
      notes,
      status: "scheduled",
    })
    .select("id, client_id, workout_id, scheduled_for, status, notes")
    .single();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}

/** Active coaching link, plus the client's timezone so date filters match their Workouts tab. */
async function clientTimeZoneForTrainer(supabase: SupabaseClient, trainerId: string, clientId: string) {
  const [linkResult, clientResult] = await Promise.all([
    supabase
      .from("trainer_clients")
      .select("client_id")
      .eq("trainer_id", trainerId)
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("clients").select("profile_id").eq("id", clientId).maybeSingle(),
  ]);

  if (linkResult.error) return { error: jsonError(databaseErrorMessage(linkResult.error), 500) };
  if (!linkResult.data) return { error: jsonError("Client not found", 404) };
  if (clientResult.error) return { error: jsonError(databaseErrorMessage(clientResult.error), 500) };
  if (!clientResult.data) return { error: jsonError("Client not found", 404) };

  const client = clientResult.data;

  const profileId = typeof client.profile_id === "string" ? client.profile_id : null;
  if (!profileId) return { timeZone: resolveTimeZone(null) };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) return { error: jsonError(databaseErrorMessage(profileError), 500) };
  return { timeZone: resolveTimeZone(typeof profile?.timezone === "string" ? profile.timezone : null) };
}
