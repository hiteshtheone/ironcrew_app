import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActiveProgramSummary } from "@/lib/api/active-programs";
import {
  type ClientDashboardData,
  type ClientExercise,
  type ClientLoggedSet,
  type ClientWorkout,
  currentWeek,
  firstNameFrom,
  formatDayNumber,
  formatLongDate,
  formatWeekday,
  greetingFor,
  initialsFrom,
  isAssignmentStatus,
  prescriptionDetail,
  resolveTimeZone,
} from "@/lib/dashboard/client-week";

type ProfileInput = {
  userId: string;
  fullName: string;
  timezone: string | null;
};

export async function loadClientDashboard(
  supabase: SupabaseClient,
  profile: ProfileInput,
): Promise<ClientDashboardData> {
  const timeZone = resolveTimeZone(profile.timezone);
  const week = currentWeek(timeZone);
  const greeting = greetingFor(timeZone);
  const fallbackName = firstNameFrom(profile.fullName);
  const shell = {
    greeting,
    firstName: fallbackName,
    dateLabel: formatLongDate(week.today),
    initials: initialsFrom(profile.fullName),
  };

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, first_name")
    .eq("profile_id", profile.userId)
    .maybeSingle();

  if (clientError) return { kind: "error", message: clientError.message };
  if (!client) return { kind: "unlinked", ...shell };

  const { data:trainerClient, error: clientTrainerError } = await supabase
    .from("trainer_clients")
    .select("trainer_id")
    .eq("client_id", client.id)
    .maybeSingle();

  let trainer_business_db
  if (trainerClient){
    const { data:trainerData, error: trainerError } = await supabase
      .from("trainers")
      .select("business_name")
      .eq("id", trainerClient.trainer_id)
      .maybeSingle();

    if (trainerData){
      trainer_business_db = trainerData.business_name
    } else {
      console.log("Failed to get trainer Data. Not crashing. Moving on!")
    }
  } else {
    console.log("No tainer associated with this client. Not crashing. Moving on!")
  }

  const trainer_business_name = trainer_business_db?.trim() || "Trainer"

  const firstName = client.first_name?.trim() || fallbackName;

  const [{ data: assignments, error: assignmentError }, { data: programAssignments, error: programError }] =
    await Promise.all([
      supabase
        .from("workout_assignments")
        .select(
          `
          id,
          scheduled_for,
          status,
          workout_sessions (
            client_feedback,
            exercise_results (
              workout_block_id,
              set_number,
              repetitions,
              load,
              load_unit,
              duration_seconds,
              distance_meters,
              notes
            )
          ),
          workouts (
            name,
            estimated_duration_minutes,
            workout_blocks (
              id,
              exercise_id,
              position,
              title,
              block_type,
              prescribed_sets,
              prescribed_reps_min,
              prescribed_reps_max,
              load_unit,
              exercises ( name )
            )
          )
        `,
        )
        .eq("client_id", client.id)
        .gte("scheduled_for", week.start)
        .lte("scheduled_for", week.end)
        .order("scheduled_for", { ascending: true }),
      supabase
        .from("program_assignments")
        .select("assigned_by_client_id, programs(name)")
        .eq("client_id", client.id)
        .in("status", ["scheduled", "in_progress"])
        .order("starts_on", { ascending: false }),
    ]);

  if (assignmentError) return { kind: "error", message: assignmentError.message };
  if (programError) return { kind: "error", message: programError.message };

  const workoutsByDate = new Map<string, ClientWorkout[]>();
  for (const row of assignments ?? []) {
    const workout = normalizeWorkout(row);
    if (!workout) continue;
    const date = stringField(row, "scheduled_for");
    if (!date) continue;
    const existing = workoutsByDate.get(date) ?? [];
    existing.push(workout);
    workoutsByDate.set(date, existing);
  }

  const days = week.days.map((date) => ({
    date,
    weekday: formatWeekday(date),
    dayNumber: formatDayNumber(date),
    isToday: date === week.today,
    workouts: workoutsByDate.get(date) ?? [],
  }));

  const todayWorkouts = workoutsByDate.get(week.today) ?? [];
  const upcoming = days
    .filter((day) => day.date > week.today)
    .flatMap((day) =>
      day.workouts
        .filter((workout) => workout.status !== "cancelled")
        .map((workout) => ({ name: workout.name, dateLabel: formatLongDate(day.date) })),
    );

  const active = days.flatMap((day) => day.workouts).filter((workout) => workout.status !== "cancelled");
  const completedCount = active.filter((workout) => workout.status === "completed").length;
  const remainingCount = active.filter(
    (workout) => workout.status === "scheduled" || workout.status === "in_progress",
  ).length;

  return {
    kind: "ready",
    trainer_business_name,
    greeting,
    firstName,
    dateLabel: formatLongDate(week.today),
    initials: shell.initials,
    clientId: client.id,
    activePrograms: activeProgramSummaries(programAssignments),
    days,
    todayWorkouts,
    nextWorkout: upcoming[0] ?? null,
    scheduledCount: active.length,
    completedCount,
    remainingCount,
  };
}

function normalizeWorkout(row: unknown): ClientWorkout | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = stringField(record, "id");
  const status = stringField(record, "status");
  if (!id || !status || !isAssignmentStatus(status)) return null;

  const workout = asRecord(firstRelation(record.workouts));
  const session = asRecord(firstRelation(record.workout_sessions));
  const setsByBlock = loggedSetsByBlock(session?.exercise_results);
  const blocks = relationList(workout?.workout_blocks)
    .map((block) => asRecord(block))
    .filter((block): block is Record<string, unknown> => block !== null)
    .sort((left, right) => numberField(left, "position") - numberField(right, "position"));

  return {
    id,
    name: stringField(workout, "name") || "Workout",
    durationMinutes: positiveNumber(workout?.estimated_duration_minutes),
    status,
    sessionNote: stringField(session, "client_feedback"),
    exercises: blocks
      .map((block) => normalizeExercise(block, setsByBlock.get(stringField(block, "id") ?? "") ?? []))
      .filter((exercise): exercise is ClientExercise => exercise !== null),
  };
}

function loggedSetsByBlock(value: unknown) {
  const setsByBlock = new Map<string, ClientLoggedSet[]>();
  for (const row of relationList(value)) {
    const record = asRecord(row);
    const blockId = stringField(record, "workout_block_id");
    const setNumber = positiveNumber(record?.set_number);
    if (!record || !blockId || setNumber == null) continue;
    const existing = setsByBlock.get(blockId) ?? [];
    existing.push({
      setNumber,
      repetitions: nonNegativeNumber(record.repetitions),
      load: nonNegativeNumber(record.load),
      loadUnit: stringField(record, "load_unit"),
      durationSeconds: nonNegativeNumber(record.duration_seconds),
      distanceMeters: nonNegativeNumber(record.distance_meters),
      notes: stringField(record, "notes"),
    });
    setsByBlock.set(blockId, existing);
  }

  for (const sets of setsByBlock.values()) {
    sets.sort((left, right) => left.setNumber - right.setNumber);
  }
  return setsByBlock;
}

function normalizeExercise(block: Record<string, unknown>, sets: ClientLoggedSet[]): ClientExercise | null {
  const id = stringField(block, "id");
  if (!id) return null;

  const exercise = asRecord(firstRelation(block.exercises));
  const name = stringField(exercise, "name") || stringField(block, "title") || labelForBlock(stringField(block, "block_type"));
  if (!name) return null;

  return {
    id,
    exerciseId: stringField(block, "exercise_id"),
    name,
    detail: prescriptionDetail(
      positiveNumber(block.prescribed_sets),
      positiveNumber(block.prescribed_reps_min),
      positiveNumber(block.prescribed_reps_max),
    ),
    prescribedSets: positiveNumber(block.prescribed_sets),
    loadUnit: stringField(block, "load_unit"),
    sets,
  };
}

function activeProgramSummaries(rows: unknown): ActiveProgramSummary[] {
  return relationList(rows)
    .map((row) => {
      const record = asRecord(row);
      const program = asRecord(firstRelation(record?.programs));
      const source: ActiveProgramSummary["source"] = stringField(record, "assigned_by_client_id") ? "self" : "trainer";
      return { name: stringField(program, "name") ?? "Program", source };
    });
}

function labelForBlock(blockType: string | null) {
  if (!blockType) return null;
  return blockType.charAt(0).toUpperCase() + blockType.slice(1);
}

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function relationList(value: unknown) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : 0;
}

function positiveNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function nonNegativeNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
