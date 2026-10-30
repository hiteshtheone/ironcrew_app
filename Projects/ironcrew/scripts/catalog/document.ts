import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

import { parse } from "yaml";

import { isBlockType, type BlockType } from "../../lib/plans/constants";

const NAME_LIMIT = 160;
const INTEGER_LIMIT = 2_147_483_647;

const ROOT_KEYS = new Set(["exercises", "workouts", "programs"]);
const EXERCISE_KEYS = new Set(["name", "muscle", "equipment", "description", "instructions", "video_url"]);
const WORKOUT_KEYS = new Set(["name", "description", "minutes", "blocks"]);
const BLOCK_KEYS = new Set(["type", "exercise", "title", "sets", "reps", "load", "unit", "rest"]);
const PROGRAM_KEYS = new Set(["name", "description", "status", "phases"]);
const PHASE_KEYS = new Set(["name", "description", "weeks"]);
const WEEK_KEYS = new Set(["name", "days"]);
const DAY_KEYS = new Set(["day", "workout", "position"]);
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
  name: string;
  description: string | null;
  instructions: string | null;
  muscle: string | null;
  equipment: string | null;
  videoUrl: string | null;
};

export type CatalogBlock = {
  blockType: BlockType;
  exercise: string | null;
  title: string | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  load: number | null;
  loadUnit: string | null;
  restSeconds: number | null;
};

export type CatalogWorkout = {
  name: string;
  description: string | null;
  minutes: number | null;
  blocks: CatalogBlock[];
};

export type CatalogDay = {
  day: number;
  workout: string;
  position: number;
};

export type CatalogWeek = {
  name: string | null;
  days: CatalogDay[];
};

export type CatalogPhase = {
  name: string;
  description: string | null;
  weeks: CatalogWeek[];
};

export type CatalogProgram = {
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
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
  if (!name) return null;
  return {
    name,
    description: optionalText(record, "description", path, issues),
    instructions: optionalText(record, "instructions", path, issues),
    muscle: optionalText(record, "muscle", path, issues),
    equipment: optionalText(record, "equipment", path, issues),
    videoUrl: optionalText(record, "video_url", path, issues),
  };
}

function parseWorkout(value: unknown, path: string, issues: string[]): CatalogWorkout | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, WORKOUT_KEYS, path, issues);
  const name = requireName(record.name, `${path}.name`, issues);
  const blocks = listField(record, "blocks", `${path}.blocks`, issues).map((item, index) =>
    parseBlock(item, `${path}.blocks[${index}]`, issues),
  );
  if (!name) return null;
  return {
    name,
    description: optionalText(record, "description", path, issues),
    minutes: optionalInteger(record, "minutes", `${path}.minutes`, issues, { min: 1 }),
    blocks: blocks.filter((block): block is CatalogBlock => block !== null),
  };
}

function parseBlock(value: unknown, path: string, issues: string[]): CatalogBlock | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, BLOCK_KEYS, path, issues);

  const exercise = optionalText(record, "exercise", path, issues);
  let blockType: BlockType = "exercise";
  if ("type" in record && record.type !== undefined) {
    if (typeof record.type !== "string" || !isBlockType(record.type)) {
      issues.push(`${path}.type: type must be warmup, exercise, superset, circuit, conditioning, cooldown, or notes`);
    } else {
      blockType = record.type;
    }
  } else if (!exercise) {
    issues.push(`${path}: a block needs an exercise or a type`);
  }

  if (blockType === "exercise" && !exercise) {
    issues.push(`${path}.exercise: an exercise block needs an exercise name`);
  }

  const reps = parseReps(record.reps, `${path}.reps`, "reps" in record, issues);
  return {
    blockType,
    exercise,
    title: optionalBoundedText(record, "title", path, issues),
    sets: optionalInteger(record, "sets", `${path}.sets`, issues, { min: 1 }),
    repsMin: reps?.min ?? null,
    repsMax: reps?.max ?? null,
    load: optionalLoad(record, `${path}.load`, issues),
    loadUnit: optionalText(record, "unit", path, issues),
    restSeconds: optionalInteger(record, "rest", `${path}.rest`, issues, { min: 0 }),
  };
}

function parseProgram(value: unknown, path: string, issues: string[]): CatalogProgram | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, PROGRAM_KEYS, path, issues);
  const name = requireName(record.name, `${path}.name`, issues);
  const phases = listField(record, "phases", `${path}.phases`, issues).map((item, index) =>
    parsePhase(item, `${path}.phases[${index}]`, issues),
  );
  if (!name) return null;
  return {
    name,
    description: optionalText(record, "description", path, issues),
    status: parseStatus(record, `${path}.status`, issues),
    phases: phases.filter((phase): phase is CatalogPhase => phase !== null),
  };
}

function parsePhase(value: unknown, path: string, issues: string[]): CatalogPhase | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, PHASE_KEYS, path, issues);
  const name = requireName(record.name, `${path}.name`, issues);
  const weeks = listField(record, "weeks", `${path}.weeks`, issues).map((item, index) =>
    parseWeek(item, `${path}.weeks[${index}]`, issues),
  );
  if (!name) return null;
  return {
    name,
    description: optionalText(record, "description", path, issues),
    weeks: weeks.filter((week): week is CatalogWeek => week !== null),
  };
}

function parseWeek(value: unknown, path: string, issues: string[]): CatalogWeek | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, WEEK_KEYS, path, issues);
  const days = assignDayPositions(listField(record, "days", `${path}.days`, issues), `${path}.days`, issues);
  return {
    name: optionalBoundedText(record, "name", path, issues),
    days,
  };
}

function assignDayPositions(values: unknown[], path: string, issues: string[]): CatalogDay[] {
  const parsed = values.map((value, index) => parseDay(value, `${path}[${index}]`, issues));
  const used = new Set<string>();
  const days: CatalogDay[] = [];

  for (const day of parsed) {
    if (!day) continue;
    let position = day.position;
    if (position == null) {
      position = 1;
      while (used.has(`${day.day}:${position}`)) position += 1;
    }
    const key = `${day.day}:${position}`;
    if (used.has(key)) {
      issues.push(`${path}: day ${day.day} position ${position} is used more than once`);
      continue;
    }
    used.add(key);
    days.push({ day: day.day, workout: day.workout, position });
  }

  return days;
}

function parseDay(value: unknown, path: string, issues: string[]): { day: number; workout: string; position: number | null } | null {
  const record = asObject(value, path, issues);
  if (!record) return null;
  rejectUnknown(record, DAY_KEYS, path, issues);
  const day = requiredInteger(record.day, `${path}.day`, issues, { min: 1, max: 7, label: "day" });
  const workout = requireName(record.workout, `${path}.workout`, issues, "workout");
  const position =
    "position" in record && record.position !== undefined
      ? requiredInteger(record.position, `${path}.position`, issues, { min: 1, label: "position" })
      : null;
  if (day == null || !workout) return null;
  return { day, workout, position };
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

function optionalLoad(record: Record<string, unknown>, path: string, issues: string[]) {
  if (!("load" in record) || record.load == null) return null;
  const value = record.load;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push(`${path}: load must be zero or greater`);
    return null;
  }
  return value;
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

function optionalBoundedText(record: Record<string, unknown>, key: string, path: string, issues: string[]) {
  const text = optionalText(record, key, path, issues);
  if (text && text.length > NAME_LIMIT) {
    issues.push(`${path}.${key}: ${key} must be ${NAME_LIMIT} characters or fewer`);
    return null;
  }
  return text;
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
