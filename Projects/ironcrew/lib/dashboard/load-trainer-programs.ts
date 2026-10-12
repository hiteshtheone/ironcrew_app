import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkoutOption = {
  id: string;
  name: string;
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
  workouts: WorkoutOption[];
};

export type TrainerProgramsData = TrainerProgramsReady | { kind: "error"; message: string };

export async function loadTrainerPrograms(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerProgramsData> {
  const [{ data: programRows, error: programError }, { data: workoutRows, error: workoutError }] =
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
      supabase.from("workouts").select("id, name").eq("trainer_id", trainerId),
    ]);

  if (programError) return { kind: "error", message: programError.message };
  if (workoutError) return { kind: "error", message: workoutError.message };

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
    .filter((workout): workout is WorkoutOption => workout !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { kind: "ready", programs, workouts };
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

function normalizeWorkout(row: unknown): WorkoutOption | null {
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
