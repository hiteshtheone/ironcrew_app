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
import {
  isTrackingParameter,
  isTrackingType,
  parametersFor,
  type ExerciseTrackingType,
  type TrackingParameter,
} from "@/lib/exercises/tracking";

export async function POST(request: Request) {
  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const name = asTrimmedString(parsedBody.body.name);
  if (name === undefined) return jsonError("name must be a string", 400);
  if (name == null || name.length > 160) {
    return jsonError("An exercise name between 1 and 160 characters is required", 400);
  }

  const trackingType = asTrimmedString(parsedBody.body.tracking_type);
  if (trackingType == null || !isTrackingType(trackingType)) {
    return jsonError("tracking_type must be a known exercise tracking type", 400);
  }

  const tracking = trackingParametersFrom(parsedBody.body.tracking_parameters, trackingType);
  if ("error" in tracking) return tracking.error;

  const secondaryMuscleGroup = optionalMuscleGroup(parsedBody.body.secondary_muscle_group);
  if ("error" in secondaryMuscleGroup) return secondaryMuscleGroup.error;

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const resolved = await resolveOwner(auth.supabase, auth.user.id);
  if ("error" in resolved) return resolved.error;

  const { data, error } = await auth.supabase
    .from("exercises")
    .insert({
      ...resolved.owner,
      name,
      tracking_type: trackingType,
      tracking_parameters: tracking.parameters,
      secondary_muscle_group: secondaryMuscleGroup.value,
    })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("An exercise with that name already exists", 409);
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(error), status);
  }

  return NextResponse.json(data, { status: 201 });
}

function trackingParametersFrom(
  value: unknown,
  trackingType: ExerciseTrackingType,
): { error: ReturnType<typeof jsonError> } | { parameters: TrackingParameter[] } {
  if (trackingType !== "custom") return { parameters: parametersFor(trackingType, null) };
  if (!Array.isArray(value) || value.length === 0) {
    return { error: jsonError("Choose at least one parameter to track", 400) };
  }
  const parameters: TrackingParameter[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isTrackingParameter(item)) {
      return { error: jsonError("tracking_parameters must be time, reps, weight, distance, or height", 400) };
    }
    if (!parameters.includes(item)) parameters.push(item);
  }
  return { parameters };
}

function optionalMuscleGroup(
  value: unknown,
): { error: ReturnType<typeof jsonError> } | { value: string | null } {
  if (value === undefined) return { value: null };
  const muscleGroup = asTrimmedString(value);
  if (muscleGroup === undefined) return { error: jsonError("secondary_muscle_group must be a string or null", 400) };
  if (muscleGroup && muscleGroup.length > 80) {
    return { error: jsonError("secondary_muscle_group must be 80 characters or fewer", 400) };
  }
  return { value: muscleGroup };
}
