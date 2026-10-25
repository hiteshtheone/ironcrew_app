/**
 * Extra columns for a workout_assignments select. Names the trainer foreign key
 * so PostgREST does not have to guess, and follows the program the slot came from.
 */
export const WORKOUT_SOURCE_COLUMNS = `
  assigned_by_client_id,
  program_assignments (
    programs ( name )
  ),
  trainers!workout_assignments_assigned_by_trainer_id_fkey (
    first_name,
    last_name,
    business_name
  )
`;

export type WorkoutSource = {
  /** Null when the workout was scheduled on its own, outside a program. */
  programName: string | null;
  /** "Self" when the client scheduled it, otherwise the trainer's name. */
  givenBy: string;
};

export function workoutSourceLabel(source: WorkoutSource) {
  return `${source.programName ?? "No program"} · ${source.givenBy}`;
}

export function workoutSourceFromRow(row: Record<string, unknown> | null | undefined): WorkoutSource {
  const assignment = asRecord(firstRelation(row?.program_assignments));
  const program = asRecord(firstRelation(assignment?.programs));
  const trainer = asRecord(firstRelation(row?.trainers));
  const selfAssigned = stringField(row, "assigned_by_client_id") != null;
  // A trainer cannot read a client's self-made program, so the name comes back
  // empty even though the assignment exists. Keep a label instead of "No program".
  const hiddenName = assignment ? (selfAssigned ? "Self-made program" : "Assigned program") : null;

  return {
    programName: stringField(program, "name") ?? hiddenName,
    givenBy: selfAssigned ? "Self" : trainerName(trainer),
  };
}

function trainerName(trainer: Record<string, unknown> | null) {
  const name = [stringField(trainer, "first_name"), stringField(trainer, "last_name")].filter(Boolean).join(" ");
  return name || stringField(trainer, "business_name") || "Trainer";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function stringField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}
