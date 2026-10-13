import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkoutOption = {
  id: string;
  name: string;
};

export type ExerciseOption = {
  id: string;
  name: string;
};

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

export async function loadTrainerPrograms(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerProgramsData> {
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
        .eq("trainer_id", trainerId),
      supabase
        .from("workouts")
        .select(
          `
          id,
          name,
          description,
          estimated_duration_minutes,
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
            exercises ( name )
          )
        `,
        )
        .eq("trainer_id", trainerId),
      supabase.from("exercises").select("id, name").or(`trainer_id.eq.${trainerId},trainer_id.is.null`),
    ]);

  if (programError) return { kind: "error", message: programError.message };
  if (workoutError) return { kind: "error", message: workoutError.message };
  if (exerciseError) return { kind: "error", message: exerciseError.message };

  const programs = (programRows ?? [])
    .map(normalizeProgram)
    .filter((program): program is TrainerProgram => program !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  if (programs.length > 0) {
    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("program_assignments")
      .select("program_id, client_id, clients(first_name, last_name)")
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
    .sort((left, right) => left.name.localeCompare(right.name));

  const exercises = (exerciseRows ?? [])
    .map(normalizeExercise)
    .filter((exercise): exercise is ExerciseOption => exercise !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

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
  };
}

function normalizeExercise(row: unknown): ExerciseOption | null {
  const record = asRecord(row);
  const id = stringField(record, "id");
  const name = stringField(record, "name");
  if (!id || !name) return null;
  return { id, name };
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
