import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bodyPartsFromList,
  muscleFromField,
  musclesFromList,
  type BodyPart,
  type Muscle,
} from "@/lib/exercises/muscle-group";
import { isTrackingType, parametersFor, type ExerciseTrackingType, type TrackingParameter } from "@/lib/exercises/tracking";

export type WorkoutOption = {
  id: string;
  name: string;
  isSystem: boolean;
};

export type ExerciseOption = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  isSystem: boolean;
  trackingType: ExerciseTrackingType;
  trackingParameters: TrackingParameter[];
  primaryMuscleGroup: Muscle | null;
  secondaryMuscleGroups: Muscle[];
  bodyParts: BodyPart[];
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
  heartRateBpm: number | null;
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
  notes: string | null;
  workouts: ProgramWorkoutSlot[];
};

export type ProgramPhase = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  weeks: ProgramWeek[];
};

export type TrainerProgram = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isSystem: boolean;
  /** True when a trainer owns this program and assigned it to the signed-in client. */
  readOnly: boolean;
  phases: ProgramPhase[];
  assignedClients: AssignedClient[];
};

export type TrainerProgramsReady = {
  kind: "ready";
  programs: TrainerProgram[];
  workouts: LibraryWorkout[];
  exercises: ExerciseOption[];
  /** Workouts placed on trainer-assigned programs. Not part of the client's library. */
  assignedWorkouts: LibraryWorkout[];
  /** Exercises on those workouts that are not already in the client's library. */
  assignedExercises: ExerciseOption[];
};

export type TrainerProgramsData = TrainerProgramsReady | { kind: "error"; message: string };

/** Who owns the programs, workouts, and exercises being loaded. */
export type ProgramOwner = { kind: "trainer"; trainerId: string } | { kind: "client"; clientId: string };

export function loadTrainerPrograms(supabase: SupabaseClient, trainerId: string): Promise<TrainerProgramsData> {
  return loadOwnedPrograms(supabase, { kind: "trainer", trainerId });
}

/** Programs a client built, plus trainer programs currently assigned to them. */
export async function loadClientPrograms(supabase: SupabaseClient, clientId: string): Promise<TrainerProgramsData> {
  const owned = await loadOwnedPrograms(supabase, { kind: "client", clientId });
  if (owned.kind === "error") return owned;

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("program_assignments")
    .select("program_id")
    .eq("client_id", clientId)
    .in("status", ["scheduled", "in_progress"]);

  if (assignmentError) return { kind: "error", message: assignmentError.message };

  const ownedIds = new Set(owned.programs.map((program) => program.id));
  const assignedIds = assignedProgramIds(assignmentRows ?? [], ownedIds);
  if (assignedIds.length === 0) return owned;

  const { data: programRows, error: programError } = await supabase
    .from("programs")
    .select(PROGRAM_SELECT)
    .in("id", assignedIds)
    .not("trainer_id", "is", null);

  if (programError) return { kind: "error", message: programError.message };

  const assignedPrograms = (programRows ?? [])
    .map(normalizeProgram)
    .filter((program): program is TrainerProgram => program !== null);

  const programs = mergeAssignedPrograms(owned.programs, assignedPrograms);
  const workoutIds = workoutIdsOnPrograms(programs.filter((program) => program.readOnly));
  if (workoutIds.length === 0) return { ...owned, programs };

  const { data: workoutRows, error: workoutError } = await supabase.from("workouts").select(WORKOUT_SELECT).in("id", workoutIds);
  if (workoutError) return { kind: "error", message: workoutError.message };

  const assignedWorkouts = (workoutRows ?? [])
    .map(normalizeWorkout)
    .filter((workout): workout is LibraryWorkout => workout !== null)
    .sort(compareLibrary);

  const knownExercises = new Set(owned.exercises.map((exercise) => exercise.id));
  const exerciseIds = exerciseIdsOnWorkouts(assignedWorkouts).filter((id) => !knownExercises.has(id));
  if (exerciseIds.length === 0) return { ...owned, programs, assignedWorkouts };

  const { data: exerciseRows, error: exerciseError } = await supabase.from("exercises").select(EXERCISE_SELECT).in("id", exerciseIds);
  if (exerciseError) return { kind: "error", message: exerciseError.message };

  const assignedExercises = (exerciseRows ?? [])
    .map(normalizeExercise)
    .filter((exercise): exercise is ExerciseOption => exercise !== null)
    .sort(compareLibrary);

  return { ...owned, programs, assignedWorkouts, assignedExercises };
}

/**
 * Owned programs stay editable. Trainer programs assigned to the client are
 * read-only and are not listed again when the client already has that id.
 */
export function mergeAssignedPrograms(owned: TrainerProgram[], assigned: TrainerProgram[]): TrainerProgram[] {
  const ownedIds = new Set(owned.map((program) => program.id));
  const extras = assigned
    .filter((program) => !ownedIds.has(program.id))
    .map((program) => ({ ...program, readOnly: true, assignedClients: [] as AssignedClient[] }));
  const editable = owned.map((program) => ({ ...program, readOnly: false }));
  return [...editable, ...extras].sort(compareLibrary);
}

export async function loadOwnedPrograms(supabase: SupabaseClient, owner: ProgramOwner): Promise<TrainerProgramsData> {
  const ownerColumn = owner.kind === "trainer" ? "trainer_id" : "owner_client_id";
  const ownerId = owner.kind === "trainer" ? owner.trainerId : owner.clientId;
  // Owned by this user, or system (no owner at all, available to everyone).
  const visibleFilter = `${ownerColumn}.eq.${ownerId},and(trainer_id.is.null,owner_client_id.is.null)`;

  const [{ data: programRows, error: programError }, { data: workoutRows, error: workoutError }, { data: exerciseRows, error: exerciseError }] =
    await Promise.all([
      supabase.from("programs").select(PROGRAM_SELECT).or(visibleFilter),
      supabase.from("workouts").select(WORKOUT_SELECT).or(visibleFilter),
      supabase.from("exercises").select(EXERCISE_SELECT).or(visibleFilter),
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

  return { kind: "ready", programs, workouts, exercises, assignedWorkouts: [], assignedExercises: [] };
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
    readOnly: false,
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

  return { id, name, description: stringField(record, "description"), position, weeks };
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
    notes: stringField(record, "notes"),
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
    heartRateBpm: numberField(record, "prescribed_heart_rate_bpm"),
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
    description: stringField(record, "description"),
    instructions: stringField(record, "instructions"),
    isSystem: isSystemRow(record),
    trackingType,
    trackingParameters: parametersFor(trackingType, record.tracking_parameters),
    primaryMuscleGroup: muscleFromField(record.primary_muscle_group),
    secondaryMuscleGroups: musclesFromList(record.secondary_muscle_groups),
    bodyParts: bodyPartsFromList(record.body_parts),
  };
}

const PROGRAM_SELECT = `
  id,
  name,
  description,
  status,
  trainer_id,
  owner_client_id,
  program_phases (
    id,
    name,
    description,
    position,
    program_weeks (
      id,
      week_number,
      name,
      notes,
      program_workouts (
        id,
        workout_id,
        day_number,
        position,
        workouts ( name )
      )
    )
  )
`;

const WORKOUT_SELECT = `
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
    prescribed_heart_rate_bpm,
    exercises ( name )
  )
`;

const EXERCISE_SELECT =
  "id, name, description, instructions, trainer_id, owner_client_id, tracking_type, tracking_parameters, primary_muscle_group, secondary_muscle_groups, body_parts";

function assignedProgramIds(rows: unknown[], ownedIds: Set<string>) {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = stringField(asRecord(row), "program_id");
    if (id && !ownedIds.has(id)) ids.add(id);
  }
  return [...ids];
}

function workoutIdsOnPrograms(programs: TrainerProgram[]) {
  const ids = new Set<string>();
  for (const program of programs) {
    for (const phase of program.phases) {
      for (const week of phase.weeks) {
        for (const slot of week.workouts) ids.add(slot.workoutId);
      }
    }
  }
  return [...ids];
}

function exerciseIdsOnWorkouts(workouts: LibraryWorkout[]) {
  const ids = new Set<string>();
  for (const workout of workouts) {
    for (const block of workout.blocks) {
      if (block.exerciseId) ids.add(block.exerciseId);
    }
  }
  return [...ids];
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
