import { formatLongDate } from "@/lib/dashboard/client-week";
import { asTrimmedString, isIsoDate, isRecord, isUuid } from "@/lib/api/route-utils";

export const LIVE_WORKOUT_NAME_MAX = 160;

export type StartWorkoutInput = {
  name: string;
  scheduledFor: string;
};

export type LiveWorkoutAccess = {
  callerClientId: string;
  assignmentClientId: string | null;
  assignedByClientId: string | null;
  ownerClientId: string | null;
  onProgram: boolean;
};

export type LiveWorkoutDenial = {
  message: string;
  status: number;
};

export function defaultLiveWorkoutName(scheduledFor: string) {
  return `Workout · ${formatLongDate(scheduledFor)}`;
}

export function parseStartWorkout(body: unknown): { ok: true; value: StartWorkoutInput } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Request body must be a JSON object" };

  const name = asTrimmedString(body.name);
  const scheduledFor = asTrimmedString(body.scheduled_for);
  if (name === undefined || scheduledFor === undefined) {
    return { ok: false, error: "Workout fields must be strings" };
  }
  if (name == null || name.length > LIVE_WORKOUT_NAME_MAX) {
    return { ok: false, error: "A workout name between 1 and 160 characters is required" };
  }
  if (scheduledFor == null || !isIsoDate(scheduledFor)) {
    return { ok: false, error: "scheduled_for must be YYYY-MM-DD" };
  }

  return { ok: true, value: { name, scheduledFor } };
}

export function parseAddExercise(body: unknown): { ok: true; exerciseId: string } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Request body must be a JSON object" };

  const exerciseId = asTrimmedString(body.exercise_id);
  if (exerciseId === undefined) return { ok: false, error: "exercise_id must be a string" };
  if (exerciseId == null || !isUuid(exerciseId)) return { ok: false, error: "exercise_id must be a UUID" };

  return { ok: true, exerciseId };
}

/**
 * A client may add or remove exercises only on a workout they own, scheduled
 * themselves, that is not placed on a program.
 */
export function liveWorkoutBlockDenial(access: LiveWorkoutAccess): LiveWorkoutDenial | null {
  if (!access.assignmentClientId || access.assignmentClientId !== access.callerClientId) {
    return { message: "Workout assignment not found", status: 404 };
  }
  if (access.assignedByClientId !== access.callerClientId) {
    return { message: "Only a workout you scheduled yourself can be changed while you train", status: 403 };
  }
  if (access.ownerClientId !== access.callerClientId) {
    return { message: "Only a workout you own can be changed while you train", status: 403 };
  }
  if (access.onProgram) {
    return { message: "This workout is on a program, so its exercises stay as prescribed", status: 409 };
  }
  return null;
}

export function canEditLiveWorkout(workout: { ownedByClient: boolean; onProgram: boolean }) {
  return workout.ownedByClient && !workout.onProgram;
}

export function exerciseUsableForLiveWorkout(
  exercise: { ownerClientId: string | null; trainerId: string | null } | null,
  callerClientId: string,
): { ok: true } | { ok: false; message: string; status: number } {
  if (!exercise) return { ok: false, message: "Exercise not found", status: 404 };
  const system = exercise.ownerClientId == null && exercise.trainerId == null;
  const own = exercise.ownerClientId === callerClientId;
  if (!system && !own) {
    return { ok: false, message: "Choose an exercise from your library or the system library", status: 403 };
  }
  return { ok: true };
}

/** Keep in-progress drafts for blocks that remain, and append blocks that are new. */
export function mergeDraftBlocks<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const currentById = new Map(current.map((block) => [block.id, block]));
  return incoming.map((block) => currentById.get(block.id) ?? block);
}
