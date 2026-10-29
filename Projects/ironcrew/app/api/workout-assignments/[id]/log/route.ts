import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  asOptionalNumber,
  asTrimmedString,
  databaseErrorMessage,
  isRecord,
  isUuid,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";
import {
  isTrackingType,
  LEGACY_TRACKING_PARAMETERS,
  parametersFor,
  type TrackingParameter,
} from "@/lib/exercises/tracking";

type RouteContext = { params: Promise<{ id: string }> };

type LoggedSet = {
  set_number: number;
  repetitions: number | null;
  load: number | null;
  load_unit: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  height_cm: number | null;
  notes: string | null;
  exercise_id: string | null;
  workout_block_id: string;
};

const MAX_SETS = 20;
const LOAD_UNITS = new Set(["kg", "lb"]);

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Assignment id must be a UUID", 400);

  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const note = asTrimmedString(parsedBody.body.note);
  if (note === undefined) return jsonError("note must be a string or null", 400);
  if (note && note.length > 10000) return jsonError("note must be 10000 characters or fewer", 400);
  if (!Array.isArray(parsedBody.body.blocks)) return jsonError("blocks must be an array", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: assignment, error: assignmentError } = await auth.supabase
    .from("workout_assignments")
    .select(
      `
      id,
      client_id,
      workout_id,
      workouts (
        workout_blocks (
          id,
          exercise_id,
          exercises ( tracking_type, tracking_parameters )
        )
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (assignmentError) {
    const failure = /row-level security/i.test(assignmentError.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(assignmentError), failure);
  }
  if (!assignment) return jsonError("Workout assignment not found", 404);

  const blocksById = blocksForAssignment(assignment);
  const parsedSets = parseBlocks(parsedBody.body.blocks, blocksById);
  if ("error" in parsedSets) return parsedSets.error;

  const sessionId = await ensureSession(auth.supabase, {
    assignmentId: id,
    clientId: stringValue(assignment.client_id),
    workoutId: stringValue(assignment.workout_id),
    note,
  });
  if ("error" in sessionId) return sessionId.error;

  const { error: deleteError } = await auth.supabase
    .from("exercise_results")
    .delete()
    .eq("workout_session_id", sessionId.id);

  if (deleteError) {
    const failure = /row-level security/i.test(deleteError.message) ? 403 : 500;
    return jsonError(databaseErrorMessage(deleteError), failure);
  }

  const rows = parsedSets.sets
    .map((set) => restrictToParameters(set, blocksById.get(set.workout_block_id)?.parameters ?? [...LEGACY_TRACKING_PARAMETERS]))
    .filter((set) => !isBlankSet(set))
    .map((set) => ({
      workout_session_id: sessionId.id,
      workout_block_id: set.workout_block_id,
      exercise_id: set.exercise_id,
      set_number: set.set_number,
      repetitions: set.repetitions,
      load: set.load,
      load_unit: set.load_unit,
      duration_seconds: set.duration_seconds,
      distance_meters: set.distance_meters,
      height_cm: set.height_cm,
      notes: set.notes,
    }));

  if (rows.length > 0) {
    const { error: insertError } = await auth.supabase.from("exercise_results").insert(rows);
    if (insertError) {
      const failure = /row-level security/i.test(insertError.message) ? 403 : 500;
      return jsonError(databaseErrorMessage(insertError), failure);
    }
  }

  return NextResponse.json({ id: sessionId.id, note });
}

function parseBlocks(
  blocks: unknown[],
  knownBlocks: Map<string, BlockTracking>,
): { error: ReturnType<typeof jsonError> } | { sets: LoggedSet[] } {
  const sets: LoggedSet[] = [];
  const seenBlocks = new Set<string>();

  for (const block of blocks) {
    if (!isRecord(block)) return { error: jsonError("Each block must be an object", 400) };
    const blockId = asTrimmedString(block.block_id);
    if (blockId == null || !isUuid(blockId)) return { error: jsonError("block_id must be a UUID", 400) };
    if (!knownBlocks.has(blockId)) return { error: jsonError("block_id is not part of this workout", 400) };
    if (seenBlocks.has(blockId)) return { error: jsonError("Each block can only be logged once", 400) };
    seenBlocks.add(blockId);
    if (!Array.isArray(block.sets)) return { error: jsonError("sets must be an array", 400) };
    if (block.sets.length > MAX_SETS) return { error: jsonError("A block can have at most 20 sets", 400) };

    const seenSets = new Set<number>();
    for (const set of block.sets) {
      const parsed = parseSet(set, blockId, knownBlocks.get(blockId)?.exerciseId ?? null);
      if ("error" in parsed) return { error: parsed.error };
      if (seenSets.has(parsed.set.set_number)) {
        return { error: jsonError("set_number must be unique within a block", 400) };
      }
      seenSets.add(parsed.set.set_number);
      sets.push(parsed.set);
    }
  }

  return { sets };
}

function parseSet(
  value: unknown,
  blockId: string,
  exerciseId: string | null,
): { error: ReturnType<typeof jsonError> } | { set: LoggedSet } {
  if (!isRecord(value)) return { error: jsonError("Each set must be an object", 400) };

  const setNumber = asOptionalNumber(value.set_number);
  if (setNumber == null || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > MAX_SETS) {
    return { error: jsonError("set_number must be a whole number from 1 to 20", 400) };
  }

  const repetitions = optionalWholeNumber(value.repetitions);
  if (repetitions === undefined) {
    return { error: jsonError("repetitions must be a whole number that is zero or greater", 400) };
  }
  const durationSeconds = optionalWholeNumber(value.duration_seconds);
  if (durationSeconds === undefined) {
    return { error: jsonError("duration_seconds must be a whole number that is zero or greater", 400) };
  }
  const load = optionalNonNegative(value.load);
  if (load === undefined) return { error: jsonError("load must be a number that is zero or greater", 400) };
  const distanceMeters = optionalNonNegative(value.distance_meters);
  if (distanceMeters === undefined) {
    return { error: jsonError("distance_meters must be a number that is zero or greater", 400) };
  }
  const heightCm = optionalNonNegative(value.height_cm);
  if (heightCm === undefined) {
    return { error: jsonError("height_cm must be a number that is zero or greater", 400) };
  }

  const loadUnit = asTrimmedString(value.load_unit);
  if (loadUnit === undefined) return { error: jsonError("load_unit must be a string or null", 400) };
  if (loadUnit && !LOAD_UNITS.has(loadUnit)) return { error: jsonError("load_unit must be kg or lb", 400) };

  const notes = asTrimmedString(value.notes);
  if (notes === undefined) return { error: jsonError("notes must be a string or null", 400) };
  if (notes && notes.length > 1000) return { error: jsonError("Set notes must be 1000 characters or fewer", 400) };

  return {
    set: {
      set_number: setNumber,
      repetitions,
      load,
      load_unit: load == null ? null : loadUnit ?? "kg",
      duration_seconds: durationSeconds,
      distance_meters: distanceMeters,
      height_cm: heightCm,
      notes,
      exercise_id: exerciseId,
      workout_block_id: blockId,
    } satisfies LoggedSet,
  };
}

function optionalWholeNumber(value: unknown) {
  const parsed = asOptionalNumber(value);
  if (parsed == null) return parsed;
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function optionalNonNegative(value: unknown) {
  const parsed = asOptionalNumber(value);
  if (parsed == null) return parsed;
  if (parsed < 0) return undefined;
  return parsed;
}

function isBlankSet(set: LoggedSet) {
  return (
    set.repetitions == null &&
    set.load == null &&
    set.duration_seconds == null &&
    set.distance_meters == null &&
    set.height_cm == null &&
    !set.notes
  );
}

async function ensureSession(
  supabase: SupabaseClient,
  input: { assignmentId: string; clientId: string | null; workoutId: string | null; note: string | null },
) {
  if (!input.clientId || !input.workoutId) return { error: jsonError("Workout assignment not found", 404) };

  const { data: existing, error: existingError } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("workout_assignment_id", input.assignmentId)
    .maybeSingle();

  if (existingError) {
    const failure = /row-level security/i.test(existingError.message) ? 403 : 500;
    return { error: jsonError(databaseErrorMessage(existingError), failure) };
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("workout_sessions")
      .update({ client_feedback: input.note })
      .eq("id", existing.id);
    if (error) {
      const failure = /row-level security/i.test(error.message) ? 403 : 500;
      return { error: jsonError(databaseErrorMessage(error), failure) };
    }
    return { id: existing.id as string };
  }

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      workout_assignment_id: input.assignmentId,
      client_id: input.clientId,
      workout_id: input.workoutId,
      status: "in_progress",
      client_feedback: input.note,
    })
    .select("id")
    .single();

  if (error || !data) {
    const message = error ? databaseErrorMessage(error) : "Couldn't save this workout";
    const failure = error && /row-level security/i.test(error.message) ? 403 : 500;
    return { error: jsonError(message, failure) };
  }

  return { id: data.id as string };
}

function blocksForAssignment(assignment: { workouts: unknown }) {
  const workout = firstRelation(assignment.workouts);
  const blocks = new Map<string, BlockTracking>();
  if (!isRecord(workout)) return blocks;
  for (const block of relationList(workout.workout_blocks)) {
    if (!isRecord(block)) continue;
    const id = asTrimmedString(block.id);
    if (!id) continue;
    const exerciseId = asTrimmedString(block.exercise_id);
    blocks.set(id, {
      exerciseId: exerciseId ?? null,
      parameters: parametersForBlock(block.exercises),
    });
  }
  return blocks;
}

type BlockTracking = {
  exerciseId: string | null;
  parameters: TrackingParameter[];
};

function parametersForBlock(exercise: unknown): TrackingParameter[] {
  const record = firstRelation(exercise);
  if (!isRecord(record)) return [...LEGACY_TRACKING_PARAMETERS];
  const trackingType = asTrimmedString(record.tracking_type);
  return parametersFor(trackingType && isTrackingType(trackingType) ? trackingType : null, record.tracking_parameters);
}

function restrictToParameters(set: LoggedSet, parameters: readonly TrackingParameter[]): LoggedSet {
  const tracked = new Set(parameters);
  const load = tracked.has("weight") ? set.load : null;
  return {
    ...set,
    repetitions: tracked.has("reps") ? set.repetitions : null,
    load,
    load_unit: load == null ? null : set.load_unit,
    duration_seconds: tracked.has("time") ? set.duration_seconds : null,
    distance_meters: tracked.has("distance") ? set.distance_meters : null,
    height_cm: tracked.has("height") ? set.height_cm : null,
  };
}

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function relationList(value: unknown) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
