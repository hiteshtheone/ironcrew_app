import type { SupabaseClient } from "@supabase/supabase-js";

import { isTrackingType, parametersFor, type ExerciseTrackingType, type TrackingParameter } from "@/lib/exercises/tracking";

export type WorkoutOption = {
  id: string;
  name: string;
  isSystem: boolean;
};

export type ExerciseOption = {
  id: string;
  name: string;
  isSystem: boolean;
  trackingType: ExerciseTrackingType;
  trackingParameters: TrackingParameter[];
  primaryMuscleGroup: string | null;
  secondaryMuscleGroup: string | null;
};

export function libraryItemLabel(name: string, isSystem: boolean) {
  return isSystem ? `${name} (System)` : name;
}

export type WorkoutBlock = {
  id: string;
  blockType: string;
  exerciseId: string | null;
  exerciseName: string | null;
  title: string | null;
  position: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  load: number | null;
  loadUnit: string | null;
  restSeconds: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  heightCm: number | null;
};

export type LibraryWorkout = WorkoutOption & {
  description: string | null;
  durationMinutes: number | null;
  blocks: WorkoutBlock[];
};

export type AssignedClient = {
  id: string;
  name: string;
};

export type ProgramWorkoutSlot = {
  id: string;
  workoutId: string;
  workoutName: string;
  dayNumber: number;
  position: number;
};

export type ProgramWeek = {
  id: string;
  weekNumber: number;
  name: string | null;
  workouts: ProgramWorkoutSlot[];
};

export type ProgramPhase = {
  id: string;
  name: string;
  position: number;
  weeks: ProgramWeek[];
};

export type TrainerProgram = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isSystem: boolean;
  phases: ProgramPhase[];
  assignedClients: AssignedClient[];
};

export type TrainerProgramsReady = {
  kind: "ready";
  programs: TrainerProgram[];
  workouts: LibraryWorkout[];
  exercises: ExerciseOption[];
};

export type TrainerProgramsData = TrainerProgramsReady | { kind: "error"; message: string };

/** Who owns the programs, workouts, and exercises being loaded. */
export type ProgramOwner = { kind: "trainer"; trainerId: string } | { kind: "client"; clientId: string };

export function loadTrainerPrograms(supabase: SupabaseClient, trainerId: string): Promise<TrainerProgramsData> {
  return loadOwnedPrograms(supabase, { kind: "trainer", trainerId });
}

/** Programs a client built for themselves (not trainer-assigned ones). */
export function loadClientPrograms(supabase: SupabaseClient, clientId: string): Promise<TrainerProgramsData> {
  return loadOwnedPrograms(supabase, { kind: "client", clientId });
}

export async function loadOwnedPrograms(supabase: SupabaseClient, owner: ProgramOwner): Promise<TrainerProgramsData> {
  const ownerColumn = owner.kind === "trainer" ? "trainer_id" : "owner_client_id";
  const ownerId = owner.kind === "trainer" ? owner.trainerId : owner.clientId;
  // Owned by this user, or system (no owner at all, available to everyone).
  const visibleFilter = `${ownerColumn}.eq.${ownerId},and(trainer_id.is.null,owner_client_id.is.null)`;

  const [{ data: programRows, error: programError }, { data: workoutRows, error: workoutError }, { data: exerciseRows, error: exerciseError }] =
    await Promise.all([
      supabase
        .from("programs")
        .select(
          `
          id,
          name,
          description,
          status,
          trainer_id,
          owner_client_id,
          program_phases (
            id,
            name,
            position,
            program_weeks (
              id,
              week_number,
              name,
              program_workouts (
                id,
                workout_id,
                day_number,
                position,
                workouts ( name )
              )
            )
          )
        `,
        )
        .or(visibleFilter),
      supabase
        .from("workouts")
        .select(
          `
          id,
          name,
          description,
          estimated_duration_minutes,
          trainer_id,
          owner_client_id,
          workout_blocks (
            id,
            position,
            block_type,
            title,
            exercise_id,
            prescribed_sets,
            prescribed_reps_min,
            prescribed_reps_max,
            prescribed_load,
            load_unit,
            rest_seconds,
            prescribed_duration_seconds,
            prescribed_distance_meters,
            prescribed_height_cm,
            exercises ( name )
          )
        `,
        )
        .or(visibleFilter),
      supabase
        .from("exercises")
        .select("id, name, trainer_id, owner_client_id, tracking_type, tracking_parameters, primary_muscle_group, secondary_muscle_group")
        .or(visibleFilter),
    ]);

  if (programError) return { kind: "error", message: programError.message };
  if (workoutError) return { kind: "error", message: workoutError.message };
  if (exerciseError) return { kind: "error", message: exerciseError.message };

  const programs = (programRows ?? [])
    .map(normalizeProgram)
    .filter((program): program is TrainerProgram => program !== null)
    .sort(compareLibrary);

  if (programs.length > 0) {
    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("program_assignments")
      .select("program_id, client_id, clients!program_assignments_client_id_fkey(first_name, last_name)")
      .in(
        "program_id",
        programs.map((program) => program.id),
      )
      .in("status", ["scheduled", "in_progress"]);

    if (assignmentError) return { kind: "error", message: assignmentError.message };

    const clientsByProgram = new Map<string, AssignedClient[]>();
    for (const row of assignmentRows ?? []) {
      const assigned = normalizeAssignedClient(row);
      if (!assigned) continue;
      const current = clientsByProgram.get(assigned.programId) ?? [];
      current.push(assigned.client);
      clientsByProgram.set(assigned.programId, current);
    }

    for (const program of programs) {
      program.assignedClients = (clientsByProgram.get(program.id) ?? []).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    }
  }

  const workouts = (workoutRows ?? [])
    .map(normalizeWorkout)
    .filter((workout): workout is LibraryWorkout => workout !== null)
    .sort(compareLibrary);

  const exercises = (exerciseRows ?? [])
    .map(normalizeExercise)
    .filter((exercise): exercise is ExerciseOption => exercise !== null)
    .sort(compareLibrary);

  return { kind: "ready", programs, workouts, exercises };
}

function normalizeProgram(row: unknown): TrainerProgram | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const name = stringField(record, "name");
  const status = stringField(record, "status");
  if (!record || !id || !name || !status) return null;

  const phases = asArray(record.program_phases)
    .map(normalizePhase)
    .filter((phase): phase is ProgramPhase => phase !== null)
    .sort((left, right) => left.position - right.position);

  return {
    id,
    name,
    description: stringField(record, "description"),
    status,
    isSystem: isSystemRow(record),
    phases,
    assignedClients: [],
  };
}

function normalizePhase(row: unknown): ProgramPhase | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const name = stringField(record, "name");
  const position = numberField(record, "position");
  if (!record || !id || !name || position == null) return null;

  const weeks = asArray(record.program_weeks)
    .map(normalizeWeek)
    .filter((week): week is ProgramWeek => week !== null)
    .sort((left, right) => left.weekNumber - right.weekNumber);

  return { id, name, position, weeks };
}

function normalizeWeek(row: unknown): ProgramWeek | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const weekNumber = numberField(record, "week_number");
  if (!record || !id || weekNumber == null) return null;

  const workouts = asArray(record.program_workouts)
    .map(normalizeSlot)
    .filter((slot): slot is ProgramWorkoutSlot => slot !== null)
    .sort((left, right) => left.dayNumber - right.dayNumber || left.position - right.position);

  return {
    id,
    weekNumber,
    name: stringField(record, "name"),
    workouts,
  };
}

function normalizeSlot(row: unknown): ProgramWorkoutSlot | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const workoutId = stringField(record, "workout_id");
  const dayNumber = numberField(record, "day_number");
  const position = numberField(record, "position");
  if (!record || !id || !workoutId || dayNumber == null || position == null) return null;

  const workout = asRecord(firstRelation(record.workouts));
  return {
    id,
    workoutId,
    workoutName: stringField(workout, "name") ?? "Workout",
    dayNumber,
    position,
  };
}

function normalizeWorkout(row: unknown): LibraryWorkout | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const name = stringField(record, "name");
  if (!record || !id || !name) return null;

  const blocks = asArray(record.workout_blocks)
    .map(normalizeBlock)
    .filter((block): block is WorkoutBlock => block !== null)
    .sort((left, right) => left.position - right.position);

  return {
    id,
    name,
    description: stringField(record, "description"),
    durationMinutes: numberField(record, "estimated_duration_minutes"),
    isSystem: isSystemRow(record),
    blocks,
  };
}

function normalizeBlock(row: unknown): WorkoutBlock | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const blockType = stringField(record, "block_type");
  const position = numberField(record, "position");
  if (!record || !id || !blockType || position == null) return null;

  const exercise = asRecord(firstRelation(record.exercises));
  return {
    id,
    blockType,
    exerciseId: stringField(record, "exercise_id"),
    exerciseName: stringField(exercise, "name"),
    title: stringField(record, "title"),
    position,
    sets: numberField(record, "prescribed_sets"),
    repsMin: numberField(record, "prescribed_reps_min"),
    repsMax: numberField(record, "prescribed_reps_max"),
    load: numberField(record, "prescribed_load"),
    loadUnit: stringField(record, "load_unit"),
    restSeconds: numberField(record, "rest_seconds"),
    durationSeconds: numberField(record, "prescribed_duration_seconds"),
    distanceMeters: numberField(record, "prescribed_distance_meters"),
    heightCm: numberField(record, "prescribed_height_cm"),
  };
}

function normalizeExercise(row: unknown): ExerciseOption | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const name = stringField(record, "name");
  if (!record || !id || !name) return null;
  const rawTrackingType = stringField(record, "tracking_type");
  const trackingType = rawTrackingType && isTrackingType(rawTrackingType) ? rawTrackingType : "custom";
  return {
    id,
    name,
    isSystem: isSystemRow(record),
    trackingType,
    trackingParameters: parametersFor(trackingType, record.tracking_parameters),
    primaryMuscleGroup: stringField(record, "primary_muscle_group"),
    secondaryMuscleGroup: stringField(record, "secondary_muscle_group"),
  };
}

function isSystemRow(record: Record<string, unknown> | null) {
  return record?.trainer_id == null && record?.owner_client_id == null;
}

function compareLibrary<T extends { name: string; isSystem: boolean }>(left: T, right: T) {
  if (left.isSystem !== right.isSystem) return left.isSystem ? 1 : -1;
  return left.name.localeCompare(right.name);
}

function normalizeAssignedClient(row: unknown) {
  const record = asRecord(row);
  const programId = stringField(record, "program_id");
  const clientId = stringField(record, "client_id");
  const client = asRecord(firstRelation(record?.clients));
  const firstName = stringField(client, "first_name");
  if (!programId || !clientId || !firstName) return null;
  const lastName = stringField(client, "last_name");
  return {
    programId,
    client: {
      id: clientId,
      name: [firstName, lastName].filter(Boolean).join(" "),
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function stringField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
