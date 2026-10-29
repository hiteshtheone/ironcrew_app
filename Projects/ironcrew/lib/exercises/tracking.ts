export const TRACKING_TYPES = [
  "time",
  "reps",
  "weight",
  "weight_reps",
  "distance",
  "distance_weight",
  "distance_time",
  "reps_height",
  "custom",
] as const;

export type ExerciseTrackingType = (typeof TRACKING_TYPES)[number];

export const TRACKING_PARAMETERS = ["time", "reps", "weight", "distance", "height"] as const;

export type TrackingParameter = (typeof TRACKING_PARAMETERS)[number];

export const TRACKING_TYPE_LABELS: Record<ExerciseTrackingType, string> = {
  time: "Time only",
  reps: "Reps only",
  weight: "Weight only",
  weight_reps: "Weight and Reps",
  distance: "Distance only",
  distance_weight: "Distance and Weight",
  distance_time: "Distance and Time",
  reps_height: "Reps and height",
  custom: "Custom",
};

export const TRACKING_PARAMETER_LABELS: Record<TrackingParameter, string> = {
  time: "Time",
  reps: "Reps",
  weight: "Weight",
  distance: "Distance",
  height: "Height",
};

const PRESET_PARAMETERS: Record<Exclude<ExerciseTrackingType, "custom">, readonly TrackingParameter[]> = {
  time: ["time"],
  reps: ["reps"],
  weight: ["weight"],
  weight_reps: ["weight", "reps"],
  distance: ["distance"],
  distance_weight: ["distance", "weight"],
  distance_time: ["distance", "time"],
  reps_height: ["reps", "height"],
};

/** Fields the log form showed before exercises had a tracking type. */
export const LEGACY_TRACKING_PARAMETERS: readonly TrackingParameter[] = ["weight", "reps", "time", "distance"];

export function isTrackingType(value: string): value is ExerciseTrackingType {
  return (TRACKING_TYPES as readonly string[]).includes(value);
}

export function isTrackingParameter(value: string): value is TrackingParameter {
  return (TRACKING_PARAMETERS as readonly string[]).includes(value);
}

export function parseTrackingParameters(value: unknown): TrackingParameter[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.replace(/^\{|\}$/g, "").split(",")
      : [];
  const parsed = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(isTrackingParameter);
  return [...new Set(parsed)];
}

/** Preset types always use their fixed list. Custom uses the stored list. */
export function parametersFor(
  type: ExerciseTrackingType | null,
  stored: unknown,
): TrackingParameter[] {
  if (!type) return [...LEGACY_TRACKING_PARAMETERS];
  if (type !== "custom") return [...PRESET_PARAMETERS[type]];
  const custom = parseTrackingParameters(stored);
  return custom.length > 0 ? custom : [...LEGACY_TRACKING_PARAMETERS];
}

export function tracks(parameters: readonly TrackingParameter[], parameter: TrackingParameter) {
  return parameters.includes(parameter);
}
