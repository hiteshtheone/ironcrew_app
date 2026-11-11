import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

import { parse } from "yaml";

import {
  bodyPartFromText,
  muscleFromText,
  type BodyPart,
  type Muscle,
} from "../../lib/exercises/muscle-group";
import {
  isTrackingParameter,
  isTrackingType,
  type ExerciseTrackingType,
  type TrackingParameter,
} from "../../lib/exercises/tracking";
import { isBlockType, type BlockType } from "../../lib/plans/constants";

const NAME_LIMIT = 160;
const INTEGER_LIMIT = 2_147_483_647;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROOT_KEYS = new Set(["exercises", "workouts", "programs"]);
const EXERCISE_KEYS = new Set([
  "id",
  "name",
  "muscle",
  "primary_muscle_group",
  "secondary_muscle_groups",
  "body_parts",
  "equipment",
  "description",
  "instructions",
  "video_url",
  "tracking_type",
  "tracking_parameters",
]);
const WORKOUT_KEYS = new Set(["id", "name", "description", "minutes", "estimated_duration_minutes", "is_template", "blocks"]);
const BLOCK_KEYS = new Set([
  "type",
  "exercise",
  "exercise_id",
  "title",
  "position",
  "sets",
  "prescribed_sets",
  "reps",
  "prescribed_reps_min",
  "prescribed_reps_max",
  "load",
  "prescribed_load",
  "unit",
  "load_unit",
  "rest",
  "rest_seconds",
  "tempo",
  "rpe_target",
  "instructions",
  "configuration",
  "prescribed_duration_seconds",
  "prescribed_distance_meters",
  "prescribed_height_cm",
  "prescribed_heart_rate_bpm",
]);
const PROGRAM_KEYS = new Set(["name", "description", "status", "estimated_duration_weeks", "phases"]);
const PHASE_KEYS = new Set(["name", "description", "position", "weeks"]);
const WEEK_KEYS = new Set(["name", "notes", "week_number", "days"]);
const DAY_KEYS = new Set(["day", "day_number", "workout", "workout_id", "position", "title_override", "notes"]);
const PRESET_TRACKING: Record<Exclude<ExerciseTrackingType, "custom">, readonly TrackingParameter[]> = {
  time: ["time"],
  reps: ["reps"],
  weight: ["weight"],
  weight_reps: ["weight", "reps"],
  distance: ["distance"],
  distance_weight: ["distance", "weight"],
  distance_time: ["distance", "time"],
  reps_height: ["reps", "height"],
  heart_rate: ["heart_rate"],
};
const PROGRAM_STATUSES = new Set(["draft", "active", "archived"]);

export class CatalogError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super(details.join("\n"));
    this.name = "CatalogError";
    this.details = details;
  }
}

export type CatalogExercise = {
  id: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  muscle: Muscle | null;
  secondaryMuscleGroups: Muscle[];
  bodyParts: BodyPart[];
  equipment: string | null;
  videoUrl: string | null;
  trackingType: ExerciseTrackingType | null;
  trackingParameters: TrackingParameter[] | null;
};

export type CatalogBlock = {
  blockType: BlockType;
  exercise: string | null;
  exerciseId: string | null;
  title: string | null;
  position: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  load: number | null;
  loadUnit: string | null;
  restSeconds: number | null;
  tempo: string | null;
  rpeTarget: number | null;
  instructions: string | null;
  configuration: Record<string, unknown>;
  durationSeconds: number | null;
  distanceMeters: number | null;
  heightCm: number | null;
  heartRateBpm: number | null;
};

export type CatalogWorkout = {
  id: string | null;
  name: string;
  description: string | null;
  minutes: number | null;
  isTemplate: boolean;
  blocks: CatalogBlock[];
};

export type CatalogDay = {
  day: number;
  workoutName: string | null;
  workoutId: string | null;
  position: number;
  titleOverride: string | null;
  notes: string | null;
};

export type CatalogWeek = {
  name: string | null;
  notes: string | null;
  weekNumber: number;
  days: CatalogDay[];
};

export type CatalogPhase = {
  name: string;
  description: string | null;
  position: number;
  weeks: CatalogWeek[];
};

export type CatalogProgram = {
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  estimatedDurationWeeks: number | null;
  phases: CatalogPhase[];
};

export type CatalogDocument = {
  exercises: CatalogExercise[];
  workouts: CatalogWorkout[];
  programs: CatalogProgram[];
};

export function catalogFiles(target: string): string[] {
  const path = resolve(target);
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new CatalogError([`${path}: file not found`]);
  }

  if (stats.isDirectory()) {
    const files = readdirSync(path)
      .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => resolve(path, name));
    if (files.length === 0) throw new CatalogError([`${path}: no .yaml or .yml files`]);
    return files;
  }

  if (!stats.isFile() || !isYaml(basename(path))) {
    throw new CatalogError([`${path}: expected a .yaml or .yml file`]);
  }
  return [path];
}

export function readCatalog(filePath: string): CatalogDocument {
  let value: unknown;
  try {
    value = parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "could not parse YAML";
    throw new CatalogError([`${filePath}: ${detail}`]);
  }
  return parseCatalog(value, filePath);
}

export function parseCatalog(value: unknown, label = "catalog"): CatalogDocument {
  const issues: string[] = [];
  const root = asObject(value, "catalog", issues);
  if (!root) throw new CatalogError(issues.map((issue) => `${label}: ${issue}`));

  rejectUnknown(root, ROOT_KEYS, "catalog", issues);
  const exercises = listField(root, "exercises", "exercises", issues).map((item, index) =>
    parseExercise(item, `exercises[${index}]`, issues),
  );
  const workouts = listField(root, "workouts", "workouts", issues).map((item, index) =>
    parseWorkout(item, `workouts[${index}]`, issues),
  );
  const programs = listField(root, "programs", "programs", issues).map((item, index) =>
    parseProgram(item, `programs[${index}]`, issues),
  );

  rejectDuplicateNames(
    exercises.flatMap((exercise) => (exercise ? [exercise.name] : [])),
    "exercises",
    "exercise",
    issues,
  );
  rejectDuplicateNames(
    workouts.flatMap((workout) => (workout ? [workout.name] : [])),
    "workouts",
    "workout",
    issues,
  );
  rejectDuplicateNames(
    programs.flatMap((program) => (program ? [program.name] : [])),
    "programs",
    "program",
    issues,
  );
  rejectDuplicateIds(
    exercises.flatMap((exercise) => (exercise?.id ? [exercise.id] : [])),
    "exercises",
    "exercise",
    issues,
  );
  rejectDuplicateIds(
    workouts.flatMap((workout) => (workout?.id ? [workout.id] : [])),
    "workouts",
    "workout",
    issues,
  );

  if (issues.length > 0) throw new CatalogError(issues.map((issue) => `${label}: ${issue}`));

  return {
    exercises: exercises.filter((exercise): exercise is CatalogExercise => exercise !== null),
    workouts: workouts.filter((workout): workout is CatalogWorkout => workout !== null),
    programs: programs.filter((program): program is CatalogProgram => program !== null),
  };
}

function parseExercise(value: unknown, path: string, issues: string[]): CatalogExercise | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, EXERCISE_KEYS, path, issues);
  const name = requireName(record.name, `${path}.name`, issues);
  const id = optionalUuid(record, "id", path, issues);
  const muscleKey = hasField(record, "primary_muscle_group") ? "primary_muscle_group" : "muscle";
  const muscleText = exclusiveText(record, "muscle", "primary_muscle_group", path, issues);
  const muscle = muscleText == null ? null : muscleFromText(muscleText);
  if (muscleText && !muscle) issues.push(`${path}.${muscleKey}: muscle must be a known muscle`);
  const secondaryMuscleGroups = parseCatalogEnumList(
    record.secondary_muscle_groups,
    `${path}.secondary_muscle_groups`,
    "secondary_muscle_groups",
    hasField(record, "secondary_muscle_groups"),
    muscleFromText,
    "muscles",
    issues,
  );
  const bodyParts = parseCatalogEnumList(
    record.body_parts,
    `${path}.body_parts`,
    "body_parts",
    hasField(record, "body_parts"),
    bodyPartFromText,
    "body parts",
    issues,
  );
  if (muscle && secondaryMuscleGroups.includes(muscle)) {
    issues.push(`${path}.secondary_muscle_groups: secondary muscle group must differ from the primary one`);
  }
  const tracking = parseTracking(record, path, issues);
  if (!name) return null;
  return {
    id,
    name,
    description: optionalText(record, "description", path, issues),
    instructions: optionalText(record, "instructions", path, issues),
    muscle,
    secondaryMuscleGroups,
    bodyParts,
    equipment: optionalText(record, "equipment", path, issues),
    videoUrl: optionalText(record, "video_url", path, issues),
    trackingType: tracking.type,
    trackingParameters: tracking.parameters,
  };
}

function parseWorkout(value: unknown, path: string, issues: string[]): CatalogWorkout | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, WORKOUT_KEYS, path, issues);
  const name = requireName(record.name, `${path}.name`, issues);
  const id = optionalUuid(record, "id", path, issues);
  const parsedBlocks = listField(record, "blocks", `${path}.blocks`, issues).flatMap((item, index) => {
    const block = parseBlock(item, `${path}.blocks[${index}]`, issues);
    return block ? [block] : [];
  });
  const positions = assignSequence(
    parsedBlocks.map((block) => block.position),
    `${path}.blocks`,
    "position",
    issues,
  );
  if (!name) return null;
  return {
    id,
    name,
    description: optionalText(record, "description", path, issues),
    minutes: exclusiveInteger(record, "minutes", "estimated_duration_minutes", path, issues, { min: 1 }),
    isTemplate: optionalBoolean(record, "is_template", path, issues, true),
    blocks: parsedBlocks.map((block, index) => ({ ...block, position: positions[index] ?? index + 1 })),
  };
}

function parseBlock(value: unknown, path: string, issues: string[]): (Omit<CatalogBlock, "position"> & { position: number | null }) | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, BLOCK_KEYS, path, issues);

  const exercise = optionalText(record, "exercise", path, issues);
  const exerciseId = optionalUuid(record, "exercise_id", path, issues);
  if (exercise && exerciseId) issues.push(`${path}: use an exercise name or exercise_id, not both`);
  let blockType: BlockType = "exercise";
  if ("type" in record && record.type !== undefined) {
    if (typeof record.type !== "string" || !isBlockType(record.type)) {
      issues.push(`${path}.type: type must be warmup, exercise, superset, circuit, conditioning, cooldown, or notes`);
    } else {
      blockType = record.type;
    }
  } else if (!exercise && !exerciseId) {
    issues.push(`${path}: a block needs an exercise or a type`);
  }

  if (blockType === "exercise" && !exercise && !exerciseId) {
    issues.push(`${path}.exercise: an exercise block needs an exercise name or exercise_id`);
  }

  const reps = parseBlockReps(record, path, issues);
  return {
    blockType,
    exercise,
    exerciseId,
    title: optionalBoundedText(record, "title", path, issues),
    position: optionalInteger(record, "position", `${path}.position`, issues, { min: 1 }),
    sets: exclusiveInteger(record, "sets", "prescribed_sets", path, issues, { min: 1 }),
    repsMin: reps.min,
    repsMax: reps.max,
    load: exclusiveNumber(record, "load", "prescribed_load", path, issues),
    loadUnit: exclusiveText(record, "unit", "load_unit", path, issues),
    restSeconds: exclusiveInteger(record, "rest", "rest_seconds", path, issues, { min: 0 }),
    tempo: optionalText(record, "tempo", path, issues),
    rpeTarget: optionalRpe(record, path, issues),
    instructions: optionalText(record, "instructions", path, issues),
    configuration: optionalObject(record, "configuration", path, issues) ?? {},
    durationSeconds: optionalInteger(record, "prescribed_duration_seconds", `${path}.prescribed_duration_seconds`, issues, { min: 0 }),
    distanceMeters: optionalNonnegativeNumber(record, "prescribed_distance_meters", path, issues),
    heightCm: optionalNonnegativeNumber(record, "prescribed_height_cm", path, issues),
    heartRateBpm: optionalInteger(record, "prescribed_heart_rate_bpm", `${path}.prescribed_heart_rate_bpm`, issues, { min: 0 }),
  };
}

function parseProgram(value: unknown, path: string, issues: string[]): CatalogProgram | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, PROGRAM_KEYS, path, issues);
  const name = requireName(record.name, `${path}.name`, issues);
  const parsedPhases = listField(record, "phases", `${path}.phases`, issues).flatMap((item, index) => {
    const phase = parsePhase(item, `${path}.phases[${index}]`, issues);
    return phase ? [phase] : [];
  });
  const positions = assignSequence(
    parsedPhases.map((phase) => phase.position),
    `${path}.phases`,
    "position",
    issues,
  );
  if (!name) return null;
  return {
    name,
    description: optionalText(record, "description", path, issues),
    status: parseStatus(record, `${path}.status`, issues),
    estimatedDurationWeeks: optionalInteger(record, "estimated_duration_weeks", `${path}.estimated_duration_weeks`, issues, { min: 1 }),
    phases: parsedPhases.map((phase, index) => ({ ...phase, position: positions[index] ?? index + 1 })),
  };
}

function parsePhase(value: unknown, path: string, issues: string[]): (Omit<CatalogPhase, "position"> & { position: number | null }) | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, PHASE_KEYS, path, issues);
  const name = requireName(record.name, `${path}.name`, issues);
  const parsedWeeks = listField(record, "weeks", `${path}.weeks`, issues).flatMap((item, index) => {
    const week = parseWeek(item, `${path}.weeks[${index}]`, issues);
    return week ? [week] : [];
  });
  const weekNumbers = assignSequence(
    parsedWeeks.map((week) => week.weekNumber),
    `${path}.weeks`,
    "week_number",
    issues,
  );
  if (!name) return null;
  return {
    name,
    description: optionalText(record, "description", path, issues),
    position: optionalInteger(record, "position", `${path}.position`, issues, { min: 1 }),
    weeks: parsedWeeks.map((week, index) => ({ ...week, weekNumber: weekNumbers[index] ?? index + 1 })),
  };
}

function parseWeek(value: unknown, path: string, issues: string[]): (Omit<CatalogWeek, "weekNumber"> & { weekNumber: number | null }) | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, WEEK_KEYS, path, issues);
  const days = assignDayPositions(listField(record, "days", `${path}.days`, issues), `${path}.days`, issues);
  return {
    name: optionalBoundedText(record, "name", path, issues),
    notes: optionalText(record, "notes", path, issues),
    weekNumber: optionalInteger(record, "week_number", `${path}.week_number`, issues, { min: 1 }),
    days,
  };
}

function assignDayPositions(values: unknown[], path: string, issues: string[]): CatalogDay[] {
  const parsed = values.map((value, index) => parseDay(value, `${path}[${index}]`, issues));
  const used = new Set<string>();
  for (const day of parsed) {
    if (!day || day.position == null) continue;
    const key = `${day.day}:${day.position}`;
    if (used.has(key)) issues.push(`${path}: day ${day.day} position ${day.position} is used more than once`);
    else used.add(key);
  }

  const days: CatalogDay[] = [];
  const placed = new Set<string>();
  for (const day of parsed) {
    if (!day) continue;
    let position = day.position;
    if (position == null) {
      position = 1;
      while (used.has(`${day.day}:${position}`)) position += 1;
      used.add(`${day.day}:${position}`);
    }
    const key = `${day.day}:${position}`;
    if (placed.has(key)) continue;
    placed.add(key);
    days.push({
      day: day.day,
      workoutName: day.workoutName,
      workoutId: day.workoutId,
      position,
      titleOverride: day.titleOverride,
      notes: day.notes,
    });
  }

  return days;
}

function parseDay(
  value: unknown,
  path: string,
  issues: string[],
): { day: number; workoutName: string | null; workoutId: string | null; position: number | null; titleOverride: string | null; notes: string | null } | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, DAY_KEYS, path, issues);
  const day = exclusiveDay(record, path, issues);
  const hasName = "workout" in record && record.workout !== undefined;
  const hasId = "workout_id" in record && record.workout_id !== undefined;
  if (hasName && hasId) issues.push(`${path}: use a workout name or workout_id, not both`);
  if (!hasName && !hasId) issues.push(`${path}: a day needs a workout name or workout_id`);
  const workoutName = hasName ? requireName(record.workout, `${path}.workout`, issues, "workout") : null;
  const workoutId = hasId ? requireUuid(record.workout_id, `${path}.workout_id`, issues) : null;
  const position =
    "position" in record && record.position !== undefined
      ? requiredInteger(record.position, `${path}.position`, issues, { min: 1, label: "position" })
      : null;
  if (day == null || (hasName && hasId) || (!workoutName && !workoutId)) return null;
  return {
    day,
    workoutName,
    workoutId,
    position,
    titleOverride: optionalText(record, "title_override", path, issues),
    notes: optionalText(record, "notes", path, issues),
  };
}

function parseStatus(record: Record<string, unknown>, path: string, issues: string[]): CatalogProgram["status"] {
  if (!("status" in record) || record.status === undefined) return "active";
  if (typeof record.status !== "string" || !PROGRAM_STATUSES.has(record.status)) {
    issues.push(`${path}: status must be draft, active, or archived`);
    return "active";
  }
  return record.status as CatalogProgram["status"];
}

function parseReps(value: unknown, path: string, present: boolean, issues: string[]) {
  if (!present || value == null) return null;
  if (typeof value === "number") {
    if (!isPositiveInteger(value)) {
      issues.push(`${path}: reps must be a positive integer or a range like 6-8`);
      return null;
    }
    return { min: value, max: value };
  }
  if (typeof value === "string") {
    const text = value.trim();
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(text);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      if (!isPositiveInteger(min) || !isPositiveInteger(max) || max < min) {
        issues.push(`${path}: reps max must be greater than or equal to reps min`);
        return null;
      }
      return { min, max };
    }
    if (/^\d+$/.test(text)) {
      const reps = Number(text);
      if (!isPositiveInteger(reps)) {
        issues.push(`${path}: reps must be a positive integer or a range like 6-8`);
        return null;
      }
      return { min: reps, max: reps };
    }
  }
  issues.push(`${path}: reps must be a positive integer or a range like 6-8`);
  return null;
}

function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
  bounds: { min: number; max?: number },
) {
  if (!(key in record) || record[key] == null) return null;
  return requiredInteger(record[key], path, issues, { ...bounds, label: key });
}

function requiredInteger(
  value: unknown,
  path: string,
  issues: string[],
  bounds: { min: number; max?: number; label: string },
) {
  const max = bounds.max ?? INTEGER_LIMIT;
  if (typeof value !== "number" || !Number.isInteger(value) || value < bounds.min || value > max) {
    const range = bounds.max == null ? `${bounds.label} must be an integer of ${bounds.min} or greater` : `${bounds.label} must be an integer from ${bounds.min} to ${bounds.max}`;
    issues.push(`${path}: ${range}`);
    return null;
  }
  return value;
}

function optionalText(record: Record<string, unknown>, key: string, path: string, issues: string[]) {
  if (!(key in record) || record[key] == null) return null;
  if (typeof record[key] !== "string") {
    issues.push(`${path}.${key}: ${key} must be a string`);
    return null;
  }
  const text = record[key].trim();
  return text.length === 0 ? null : text;
}

function optionalBoundedText(record: Record<string, unknown>, key: string, path: string, issues: string[], max = NAME_LIMIT) {
  const text = optionalText(record, key, path, issues);
  if (text && text.length > max) {
    issues.push(`${path}.${key}: ${key} must be ${max} characters or fewer`);
    return null;
  }
  return text;
}

function exclusiveText(record: Record<string, unknown>, left: string, right: string, path: string, issues: string[]) {
  if (hasField(record, left) && hasField(record, right)) {
    issues.push(`${path}: use ${left} or ${right}, not both`);
    return null;
  }
  return optionalText(record, hasField(record, right) ? right : left, path, issues);
}

function exclusiveInteger(
  record: Record<string, unknown>,
  left: string,
  right: string,
  path: string,
  issues: string[],
  bounds: { min: number; max?: number },
) {
  if (hasField(record, left) && hasField(record, right)) {
    issues.push(`${path}: use ${left} or ${right}, not both`);
    return null;
  }
  const key = hasField(record, right) ? right : left;
  return optionalInteger(record, key, `${path}.${key}`, issues, bounds);
}

function exclusiveNumber(record: Record<string, unknown>, left: string, right: string, path: string, issues: string[]) {
  if (hasField(record, left) && hasField(record, right)) {
    issues.push(`${path}: use ${left} or ${right}, not both`);
    return null;
  }
  const key = hasField(record, right) ? right : left;
  if (!hasField(record, key)) return null;
  return optionalNonnegativeNumber(record, key, path, issues);
}

function exclusiveDay(record: Record<string, unknown>, path: string, issues: string[]) {
  if (hasField(record, "day") && hasField(record, "day_number")) {
    issues.push(`${path}: use day or day_number, not both`);
    return null;
  }
  const key = hasField(record, "day_number") ? "day_number" : "day";
  return requiredInteger(record[key], `${path}.${key}`, issues, { min: 1, max: 7, label: key });
}

function parseBlockReps(record: Record<string, unknown>, path: string, issues: string[]) {
  const hasRange = hasField(record, "reps");
  const hasMin = hasField(record, "prescribed_reps_min");
  const hasMax = hasField(record, "prescribed_reps_max");
  if (hasRange && (hasMin || hasMax)) {
    issues.push(`${path}: use reps or prescribed_reps_min and prescribed_reps_max, not both`);
    return { min: null, max: null };
  }
  if (hasRange) {
    const reps = parseReps(record.reps, `${path}.reps`, true, issues);
    return { min: reps?.min ?? null, max: reps?.max ?? null };
  }
  const min = optionalInteger(record, "prescribed_reps_min", `${path}.prescribed_reps_min`, issues, { min: 1 });
  const max = optionalInteger(record, "prescribed_reps_max", `${path}.prescribed_reps_max`, issues, { min: 1 });
  if (min != null && max != null && max < min) issues.push(`${path}: prescribed_reps_max must be greater than or equal to prescribed_reps_min`);
  return { min, max };
}

function parseTracking(record: Record<string, unknown>, path: string, issues: string[]) {
  const hasType = hasField(record, "tracking_type");
  const hasParameters = hasField(record, "tracking_parameters");
  if (!hasType && !hasParameters) return { type: null, parameters: null };
  if (!hasType || typeof record.tracking_type !== "string" || !isTrackingType(record.tracking_type)) {
    if (!hasType) issues.push(`${path}.tracking_type: tracking_type is required when tracking_parameters is set`);
    else issues.push(`${path}.tracking_type: tracking_type is not recognized`);
    return { type: null, parameters: null };
  }

  const type = record.tracking_type;
  if (type !== "custom") {
    const expected = [...PRESET_TRACKING[type]];
    if (hasParameters) {
      const parameters = parseTrackingList(record.tracking_parameters, `${path}.tracking_parameters`, issues);
      if (parameters && !sameParameters(parameters, expected)) {
        issues.push(`${path}.tracking_parameters: ${type} uses ${expected.join(", ")}`);
      }
    }
    return { type, parameters: expected };
  }

  if (!hasParameters) {
    issues.push(`${path}.tracking_parameters: custom tracking needs at least one parameter`);
    return { type: null, parameters: null };
  }
  const parameters = parseTrackingList(record.tracking_parameters, `${path}.tracking_parameters`, issues);
  return parameters ? { type, parameters } : { type: null, parameters: null };
}

function parseCatalogEnumList<T extends string>(
  value: unknown,
  path: string,
  field: string,
  present: boolean,
  parse: (item: string) => T | null,
  noun: string,
  issues: string[],
): T[] {
  if (!present) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path}: ${field} must be a list of ${noun}`);
    return [];
  }
  const parsed: T[] = [];
  for (const item of value) {
    const next = typeof item === "string" ? parse(item) : null;
    if (!next) {
      issues.push(`${path}: ${field} must list known ${noun}`);
      return [];
    }
    if (parsed.includes(next)) {
      issues.push(`${path}: ${field} cannot repeat a value`);
      return [];
    }
    parsed.push(next);
  }
  return parsed;
}

function parseTrackingList(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path}: tracking_parameters must list at least one of time, reps, weight, distance, height, heart rate`);
    return null;
  }
  const parameters: TrackingParameter[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isTrackingParameter(item)) {
      issues.push(`${path}: tracking_parameters must list time, reps, weight, distance, height, or heart rate`);
      return null;
    }
    parameters.push(item);
  }
  if (new Set(parameters).size !== parameters.length) {
    issues.push(`${path}: tracking_parameters cannot repeat a value`);
    return null;
  }
  return parameters;
}

function sameParameters(left: readonly TrackingParameter[], right: readonly TrackingParameter[]) {
  return [...left].sort().join() === [...right].sort().join();
}

function optionalRpe(record: Record<string, unknown>, path: string, issues: string[]) {
  if (!hasField(record, "rpe_target")) return null;
  const value = record.rpe_target;
  const scale = typeof value === "number" ? Math.abs(value * 10 - Math.round(value * 10)) : 1;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10 || scale > 1e-6) {
    issues.push(`${path}.rpe_target: rpe_target must be from 0 to 10, with at most one decimal`);
    return null;
  }
  return value;
}

function optionalNonnegativeNumber(record: Record<string, unknown>, key: string, path: string, issues: string[]) {
  if (!hasField(record, key)) return null;
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push(`${path}.${key}: ${key} must be zero or greater`);
    return null;
  }
  return value;
}

function optionalObject(record: Record<string, unknown>, key: string, path: string, issues: string[]) {
  if (!hasField(record, key)) return null;
  const value = record[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${path}.${key}: ${key} must be an object`);
    return null;
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(record: Record<string, unknown>, key: string, path: string, issues: string[], fallback: boolean) {
  if (!hasField(record, key)) return fallback;
  if (typeof record[key] !== "boolean") {
    issues.push(`${path}.${key}: ${key} must be true or false`);
    return fallback;
  }
  return record[key];
}

function assignSequence(explicit: Array<number | null>, path: string, label: string, issues: string[]) {
  const used = new Set<number>();
  for (const requested of explicit) {
    if (requested == null) continue;
    if (used.has(requested)) issues.push(`${path}: ${label} ${requested} is used more than once`);
    used.add(requested);
  }
  return explicit.map((requested) => {
    if (requested != null) return requested;
    let value = 1;
    while (used.has(value)) value += 1;
    used.add(value);
    return value;
  });
}

function hasField(record: Record<string, unknown>, key: string) {
  return key in record && record[key] !== undefined && record[key] !== null;
}

function optionalUuid(record: Record<string, unknown>, key: string, path: string, issues: string[]) {
  if (!(key in record) || record[key] == null) return null;
  return requireUuid(record[key], `${path}.${key}`, issues);
}

function requireUuid(value: unknown, path: string, issues: string[]) {
  if (typeof value !== "string" || !UUID.test(value.trim())) {
    issues.push(`${path}: must be a uuid`);
    return null;
  }
  return value.trim().toLowerCase();
}

function rejectDuplicateIds(ids: string[], path: string, label: string, issues: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issues.push(`${path}: duplicate ${label} id ${id}`);
    seen.add(id);
  }
}

function requireName(value: unknown, path: string, issues: string[], label = "name") {
  if (typeof value !== "string") {
    issues.push(`${path}: ${label} must be a string`);
    return null;
  }
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_LIMIT) {
    issues.push(`${path}: ${label} must be between 1 and ${NAME_LIMIT} characters`);
    return null;
  }
  return name;
}

function rejectDuplicateNames(names: string[], path: string, label: string, issues: string[]) {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) issues.push(`${path}: duplicate ${label} "${name}"`);
    seen.add(name);
  }
}

function rejectUnknown(record: Record<string, unknown>, allowed: Set<string>, path: string, issues: string[]) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) issues.push(`${path}: unknown field "${key}"`);
  }
}

function listField(record: Record<string, unknown>, key: string, path: string, issues: string[]) {
  if (!(key in record) || record[key] === undefined) return [];
  if (!Array.isArray(record[key])) {
    issues.push(`${path}: expected a list`);
    return [];
  }
  return record[key];
}

function asObject(value: unknown, path: string, issues: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${path}: expected an object`);
    return null;
  }
  return value as Record<string, unknown>;
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0 && value <= INTEGER_LIMIT;
}

function isYaml(name: string) {
  return name.endsWith(".yaml") || name.endsWith(".yml");
}
