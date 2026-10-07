import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type AssignmentStatus,
  type ClientDashboardData,
  type ClientExercise,
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

  const firstName = client.first_name?.trim() || fallbackName;

  const [{ data: assignments, error: assignmentError }, { data: programAssignment, error: programError }] =
    await Promise.all([
      supabase
        .from("workout_assignments")
        .select(
          `
          id,
          scheduled_for,
          status,
          workouts (
            name,
            estimated_duration_minutes,
            workout_blocks (
              id,
              position,
              title,
              block_type,
              prescribed_sets,
              prescribed_reps_min,
              prescribed_reps_max,
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
        .select("programs(name)")
        .eq("client_id", client.id)
        .in("status", ["scheduled", "in_progress"])
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
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
    workouts: (workoutsByDate.get(date) ?? []).map(({ id, name, status }) => ({ id, name, status })),
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
    greeting,
    firstName,
    dateLabel: formatLongDate(week.today),
    initials: shell.initials,
    programName: programName(programAssignment),
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
  const blocks = relationList(workout?.workout_blocks)
    .map((block) => asRecord(block))
    .filter((block): block is Record<string, unknown> => block !== null)
    .sort((left, right) => numberField(left, "position") - numberField(right, "position"));

  return {
    id,
    name: stringField(workout, "name") || "Workout",
    durationMinutes: positiveNumber(workout?.estimated_duration_minutes),
    status,
    exercises: blocks.map(normalizeExercise).filter((exercise): exercise is ClientExercise => exercise !== null),
  };
}

function normalizeExercise(block: Record<string, unknown>): ClientExercise | null {
  const id = stringField(block, "id");
  if (!id) return null;

  const exercise = asRecord(firstRelation(block.exercises));
  const name = stringField(exercise, "name") || stringField(block, "title") || labelForBlock(stringField(block, "block_type"));
  if (!name) return null;

  return {
    id,
    name,
    detail: prescriptionDetail(
      positiveNumber(block.prescribed_sets),
      positiveNumber(block.prescribed_reps_min),
      positiveNumber(block.prescribed_reps_max),
    ),
  };
}

function programName(row: unknown) {
  const record = asRecord(row);
  const program = asRecord(firstRelation(record?.programs));
  return stringField(program, "name");
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
  return typeof value === "number" && value > 0 ? value : null;
}
