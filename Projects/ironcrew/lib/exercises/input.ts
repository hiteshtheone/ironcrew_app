import { NextResponse } from "next/server";

import { asTrimmedString, databaseErrorMessage, isRecord, jsonError } from "@/lib/api/route-utils";
import { muscleGroupsMatch } from "@/lib/exercises/muscle-group";
import {
  isTrackingParameter,
  isTrackingType,
  parametersFor,
  type ExerciseTrackingType,
  type TrackingParameter,
} from "@/lib/exercises/tracking";

export type ExerciseWrite = {
  name: string;
  trackingType: ExerciseTrackingType;
  trackingParameters: TrackingParameter[];
  primaryMuscleGroup: string | null;
  secondaryMuscleGroup: string | null;
};

/** Create accepts a name alone. Update requires the tracking type and a primary muscle group. */
export function parseExerciseWrite(
  body: unknown,
  mode: "create" | "update",
): { error: NextResponse } | { value: ExerciseWrite } {
  if (!isRecord(body)) return { error: jsonError("Request body must be a JSON object", 400) };

  const name = asTrimmedString(body.name);
  if (name === undefined) return { error: jsonError("name must be a string", 400) };
  if (name == null || name.length > 160) {
    return { error: jsonError("An exercise name between 1 and 160 characters is required", 400) };
  }

  const trackingType = parseTrackingType(body.tracking_type, mode);
  if ("error" in trackingType) return trackingType;

  const tracking = trackingParametersFrom(body.tracking_parameters, trackingType.value);
  if ("error" in tracking) return tracking;

  const primaryMuscleGroup = parseMuscleGroup(body.primary_muscle_group, "primary_muscle_group", mode === "update");
  if ("error" in primaryMuscleGroup) return primaryMuscleGroup;

  const secondaryMuscleGroup = parseMuscleGroup(body.secondary_muscle_group, "secondary_muscle_group", false);
  if ("error" in secondaryMuscleGroup) return secondaryMuscleGroup;

  if (
    primaryMuscleGroup.value &&
    secondaryMuscleGroup.value &&
    muscleGroupsMatch(primaryMuscleGroup.value, secondaryMuscleGroup.value)
  ) {
    return { error: jsonError("Secondary muscle group must be different from the primary muscle group", 400) };
  }

  return {
    value: {
      name,
      trackingType: trackingType.value,
      trackingParameters: tracking.parameters,
      primaryMuscleGroup: primaryMuscleGroup.value,
      secondaryMuscleGroup: secondaryMuscleGroup.value,
    },
  };
}

export function exerciseWriteError(error: { code?: string; message: string; details?: string | null; hint?: string | null }) {
  if (error.code === "23505") return jsonError("An exercise with that name already exists", 409);
  if (error.code === "23514" && /muscle_groups_distinct/i.test(error.message)) {
    return jsonError("Secondary muscle group must be different from the primary muscle group", 400);
  }
  const status = /row-level security/i.test(error.message) ? 403 : 500;
  return jsonError(databaseErrorMessage(error), status);
}

function parseTrackingType(
  value: unknown,
  mode: "create" | "update",
): { error: NextResponse } | { value: ExerciseTrackingType } {
  if (value === undefined && mode === "create") return { value: "weight_reps" };
  const trackingType = asTrimmedString(value);
  if (trackingType == null || !isTrackingType(trackingType)) {
    return { error: jsonError("tracking_type must be a known exercise tracking type", 400) };
  }
  return { value: trackingType };
}

function trackingParametersFrom(
  value: unknown,
  trackingType: ExerciseTrackingType,
): { error: NextResponse } | { parameters: TrackingParameter[] } {
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

function parseMuscleGroup(
  value: unknown,
  field: "primary_muscle_group" | "secondary_muscle_group",
  required: boolean,
): { error: NextResponse } | { value: string | null } {
  if (value === undefined) {
    if (required) return { error: jsonError("A primary muscle group is required", 400) };
    return { value: null };
  }
  const muscleGroup = asTrimmedString(value);
  if (muscleGroup === undefined) return { error: jsonError(`${field} must be a string or null`, 400) };
  if (required && muscleGroup == null) return { error: jsonError("A primary muscle group is required", 400) };
  if (muscleGroup && muscleGroup.length > 80) {
    return { error: jsonError(`${field} must be 80 characters or fewer`, 400) };
  }
  return { value: muscleGroup };
}
