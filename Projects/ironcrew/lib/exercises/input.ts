import { NextResponse } from "next/server";

import { asTrimmedString, databaseErrorMessage, isRecord, jsonError } from "@/lib/api/route-utils";
import {
  isBodyPart,
  isMuscle,
  type BodyPart,
  type Muscle,
} from "@/lib/exercises/muscle-group";
import {
  isTrackingParameter,
  isTrackingType,
  parametersFor,
  type ExerciseTrackingType,
  type TrackingParameter,
} from "@/lib/exercises/tracking";

export type ExerciseWrite = {
  name: string;
  description: string | null;
  instructions: string | null;
  trackingType: ExerciseTrackingType;
  trackingParameters: TrackingParameter[];
  primaryMuscleGroup: Muscle | null;
  secondaryMuscleGroups: Muscle[];
  bodyParts: BodyPart[];
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

  const primaryMuscleGroup = parsePrimaryMuscle(body.primary_muscle_group, mode === "update");
  if ("error" in primaryMuscleGroup) return primaryMuscleGroup;

  const secondaryMuscleGroups = parseEnumList(body.secondary_muscle_groups, "secondary_muscle_groups", "muscles", isMuscle);
  if ("error" in secondaryMuscleGroups) return secondaryMuscleGroups;

  const bodyParts = parseEnumList(body.body_parts, "body_parts", "body parts", isBodyPart);
  if ("error" in bodyParts) return bodyParts;

  const description = parseOptionalText(body.description, "description");
  if ("error" in description) return description;

  const instructions = parseOptionalText(body.instructions, "instructions");
  if ("error" in instructions) return instructions;

  if (primaryMuscleGroup.value && secondaryMuscleGroups.value.includes(primaryMuscleGroup.value)) {
    return { error: jsonError("Secondary muscle group must be different from the primary muscle group", 400) };
  }

  return {
    value: {
      name,
      description: description.value,
      instructions: instructions.value,
      trackingType: trackingType.value,
      trackingParameters: tracking.parameters,
      primaryMuscleGroup: primaryMuscleGroup.value,
      secondaryMuscleGroups: secondaryMuscleGroups.value,
      bodyParts: bodyParts.value,
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
      return { error: jsonError("tracking_parameters must be time, reps, weight, distance, height, or heart rate", 400) };
    }
    if (!parameters.includes(item)) parameters.push(item);
  }
  return { parameters };
}

function parseOptionalText(
  value: unknown,
  field: "description" | "instructions",
): { error: NextResponse } | { value: string | null } {
  if (value === undefined) return { value: null };
  const text = asTrimmedString(value);
  if (text === undefined) return { error: jsonError(`${field} must be a string or null`, 400) };
  if (text && text.length > 4000) {
    return { error: jsonError(`${field} must be 4000 characters or fewer`, 400) };
  }
  return { value: text };
}

function parsePrimaryMuscle(
  value: unknown,
  required: boolean,
): { error: NextResponse } | { value: Muscle | null } {
  if (value === undefined || value === null || value === "") {
    if (required) return { error: jsonError("A primary muscle group is required", 400) };
    return { value: null };
  }
  if (typeof value !== "string" || !isMuscle(value)) {
    return { error: jsonError("primary_muscle_group must be a known muscle", 400) };
  }
  return { value };
}

function parseEnumList<T extends string>(
  value: unknown,
  field: string,
  noun: string,
  isValue: (item: string) => item is T,
): { error: NextResponse } | { value: T[] } {
  if (value === undefined || value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: jsonError(`${field} must be a list of ${noun}`, 400) };
  const parsed: T[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isValue(item)) {
      return { error: jsonError(`${field} must list known ${noun}`, 400) };
    }
    if (parsed.includes(item)) return { error: jsonError(`${field} cannot repeat a value`, 400) };
    parsed.push(item);
  }
  return { value: parsed };
}
