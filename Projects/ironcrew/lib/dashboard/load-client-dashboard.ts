import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActiveProgramSummary } from "@/lib/api/active-programs";
import { databaseErrorMessage } from "@/lib/api/route-utils";
import { WORKOUT_SOURCE_COLUMNS, workoutSourceFromRow } from "@/lib/dashboard/workout-source";
import { bodyPartsFromList, muscleFromField, musclesFromList } from "@/lib/exercises/muscle-group";
import { isTrackingType, LEGACY_TRACKING_PARAMETERS, parametersFor } from "@/lib/exercises/tracking";
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
import { previousSetsForBlock, type PriorResult } from "@/lib/dashboard/workout-prefill";

type ProfileInput = {
  userId: string;
  fullName: string;
  timezone: string | null;
};

/** Sessions, logged sets, and the prescribed blocks for one assignment. */
const WORKOUT_EXECUTION_COLUMNS = `
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
      height_cm,
      heart_rate_bpm,
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
      prescribed_load,
      load_unit,
      prescribed_duration_seconds,
      prescribed_distance_meters,
      prescribed_height_cm,
      prescribed_heart_rate_bpm,
      exercises ( name, tracking_type, tracking_parameters, primary_muscle_group, secondary_muscle_groups, body_parts )
    )
  )
`;

const ASSIGNMENT_COLUMNS = `
  id,
  scheduled_for,
  status,
  ${WORKOUT_SOURCE_COLUMNS},
  ${WORKOUT_EXECUTION_COLUMNS}
`;

export type AssignmentDetail = {
  scheduledFor: string;
  clientName: string;
  workout: ClientWorkout;
};

export type AssignmentDetailError = {
  message: string;
  status: number;
};

/**
 * One assignment with its program, who assigned it, the session note, and logged sets.
 * Row level security hides assignments the caller cannot see.
 */
export async function loadAssignmentDetail(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<{ detail: AssignmentDetail } | { error: AssignmentDetailError }> {
  const { data, error } = await supabase
    .from("workout_assignments")
    .select(
      `
      id,
      client_id,
      scheduled_for,
      status,
      ${WORKOUT_SOURCE_COLUMNS},
      clients!workout_assignments_client_id_fkey ( first_name, last_name ),
      ${WORKOUT_EXECUTION_COLUMNS}
    `,
    )
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return { error: { message: databaseErrorMessage(error), status } };
  }
  if (!data) return { error: { message: "Workout assignment not found", status: 404 } };

  const record = asRecord(data);
  const clientId = stringField(record, "client_id");
  const scheduledFor = stringField(record, "scheduled_for");
  if (!clientId || !scheduledFor) return { error: { message: "Workout assignment not found", status: 404 } };

  const previousByBlock = await loadPreviousSets(supabase, clientId, [data]);
  if (!previousByBlock.ok) return { error: { message: previousByBlock.message, status: 500 } };

  const workout = normalizeWorkout(data, previousByBlock.sets);
  if (!workout) return { error: { message: "Workout assignment not found", status: 404 } };

  return { detail: { scheduledFor, clientName: clientNameFrom(record), workout } };
}

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
    today: week.today,
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
      supabase.from("workout_assignments").select(ASSIGNMENT_COLUMNS)
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

  const previousByBlock = await loadPreviousSets(supabase, client.id, assignments ?? []);
  if (!previousByBlock.ok) return { kind: "error", message: previousByBlock.message };

  const workoutsByDate = new Map<string, ClientWorkout[]>();
  for (const row of assignments ?? []) {
    const workout = normalizeWorkout(row, previousByBlock.sets);
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
        .map((workout) => ({
          name: workout.name,
          dateLabel: formatLongDate(day.date),
          programName: workout.programName,
          givenBy: workout.givenBy,
        })),
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
    today: week.today,
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

async function loadPreviousSets(
  supabase: SupabaseClient,
  clientId: string,
  rows: unknown[],
): Promise<{ ok: true; sets: Map<string, ClientLoggedSet[]> } | { ok: false; message: string }> {
  const targets = assignmentTargets(rows);
  if (targets.length === 0) return { ok: true, sets: new Map<string, ClientLoggedSet[]>() };

  const blockIds = [...new Set(targets.map((target) => target.blockId))];
  const exerciseIds = [...new Set(targets.flatMap((target) => (target.exerciseId ? [target.exerciseId] : [])))];
  const latestDate = targets.reduce(
    (latest, target) => (target.scheduledFor > latest ? target.scheduledFor : latest),
    targets[0].scheduledFor,
  );
  const filter = [
    blockIds.length > 0 ? `workout_block_id.in.(${blockIds.join(",")})` : null,
    exerciseIds.length > 0 ? `exercise_id.in.(${exerciseIds.join(",")})` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(",");

  const { data, error } = await supabase
    .from("exercise_results")
    .select(
      `
      workout_block_id,
      exercise_id,
      set_number,
      repetitions,
      load,
      load_unit,
      duration_seconds,
      distance_meters,
      height_cm,
      heart_rate_bpm,
      notes,
      created_at,
      workout_sessions!inner (
        started_at,
        client_id,
        workout_assignment_id,
        workout_assignments!inner (
          scheduled_for
        )
      )
    `,
    )
    .eq("workout_sessions.client_id", clientId)
    .lte("workout_sessions.workout_assignments.scheduled_for", latestDate)
    .or(filter)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return { ok: false, message: error.message || "Couldn't load previous workout logs" };

  const results = priorResults(data);
  const sets = new Map<string, ClientLoggedSet[]>();
  for (const target of targets) {
    sets.set(`${target.assignmentId}:${target.blockId}`, previousSetsForBlock(results, target));
  }
  return { ok: true, sets };
}

function assignmentTargets(rows: unknown[]) {
  const targets: { assignmentId: string; scheduledFor: string; blockId: string; exerciseId: string | null }[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const assignmentId = stringField(record, "id");
    const scheduledFor = stringField(record, "scheduled_for");
    if (!record || !assignmentId || !scheduledFor) continue;
    const workout = asRecord(firstRelation(record.workouts));
    for (const block of relationList(workout?.workout_blocks)) {
      const blockRecord = asRecord(block);
      const blockId = stringField(blockRecord, "id");
      if (!blockRecord || !blockId) continue;
      targets.push({
        assignmentId,
        scheduledFor,
        blockId,
        exerciseId: stringField(blockRecord, "exercise_id"),
      });
    }
  }
  return targets;
}

function priorResults(rows: unknown): PriorResult[] {
  const results: PriorResult[] = [];
  for (const row of relationList(rows)) {
    const record = asRecord(row);
    const session = asRecord(firstRelation(record?.workout_sessions));
    const assignment = asRecord(firstRelation(session?.workout_assignments));
    const assignmentId = stringField(session, "workout_assignment_id");
    const scheduledFor = stringField(assignment, "scheduled_for");
    const setNumber = positiveNumber(record?.set_number);
    if (!record || !assignmentId || !scheduledFor || setNumber == null) continue;
    results.push({
      assignmentId,
      scheduledFor,
      startedAt: stringField(session, "started_at") ?? "",
      createdAt: stringField(record, "created_at") ?? "",
      blockId: stringField(record, "workout_block_id"),
      exerciseId: stringField(record, "exercise_id"),
      set: {
        setNumber,
        repetitions: nonNegativeNumber(record.repetitions),
        load: nonNegativeNumber(record.load),
        loadUnit: stringField(record, "load_unit"),
        durationSeconds: nonNegativeNumber(record.duration_seconds),
        distanceMeters: nonNegativeNumber(record.distance_meters),
        heightCm: nonNegativeNumber(record.height_cm),
        heartRateBpm: nonNegativeNumber(record.heart_rate_bpm),
        notes: stringField(record, "notes"),
      },
    });
  }
  return results;
}

function normalizeWorkout(row: unknown, previousByBlock: Map<string, ClientLoggedSet[]>): ClientWorkout | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = stringField(record, "id");
  const status = stringField(record, "status");
  if (!id || !status || !isAssignmentStatus(status)) return null;

  const workout = asRecord(firstRelation(record.workouts));
  const source = workoutSourceFromRow(record);
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
    programName: source.programName,
    givenBy: source.givenBy,
    status,
    sessionNote: stringField(session, "client_feedback"),
    exercises: blocks
      .map((block) => {
        const blockId = stringField(block, "id") ?? "";
        return normalizeExercise(
          block,
          setsByBlock.get(blockId) ?? [],
          previousByBlock.get(`${id}:${blockId}`) ?? [],
        );
      })
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
      heightCm: nonNegativeNumber(record.height_cm),
      heartRateBpm: nonNegativeNumber(record.heart_rate_bpm),
      notes: stringField(record, "notes"),
    });
    setsByBlock.set(blockId, existing);
  }

  for (const sets of setsByBlock.values()) {
    sets.sort((left, right) => left.setNumber - right.setNumber);
  }
  return setsByBlock;
}

function normalizeExercise(
  block: Record<string, unknown>,
  sets: ClientLoggedSet[],
  previousSets: ClientLoggedSet[],
): ClientExercise | null {
  const id = stringField(block, "id");
  if (!id) return null;

  const exercise = asRecord(firstRelation(block.exercises));
  const name = stringField(exercise, "name") || stringField(block, "title") || labelForBlock(stringField(block, "block_type"));
  if (!name) return null;

  const parameters = trackingParametersFor(exercise);
  const repsMin = parameters.includes("reps") ? positiveNumber(block.prescribed_reps_min) : null;
  const repsMax = parameters.includes("reps") ? positiveNumber(block.prescribed_reps_max) : null;
  const load = parameters.includes("weight") ? nonNegativeNumber(block.prescribed_load) : null;
  const durationSeconds = parameters.includes("time") ? nonNegativeNumber(block.prescribed_duration_seconds) : null;
  const distanceMeters = parameters.includes("distance") ? nonNegativeNumber(block.prescribed_distance_meters) : null;
  const heightCm = parameters.includes("height") ? nonNegativeNumber(block.prescribed_height_cm) : null;
  const heartRateBpm = parameters.includes("heart_rate") ? nonNegativeNumber(block.prescribed_heart_rate_bpm) : null;
  return {
    id,
    exerciseId: stringField(block, "exercise_id"),
    name,
    detail: prescriptionDetail(positiveNumber(block.prescribed_sets), repsMin, repsMax, {
      load,
      loadUnit: stringField(block, "load_unit"),
      durationSeconds,
      distanceMeters,
      heightCm,
      heartRateBpm,
    }),
    prescribedSets: positiveNumber(block.prescribed_sets),
    repsMin,
    repsMax,
    load,
    loadUnit: stringField(block, "load_unit"),
    durationSeconds,
    distanceMeters,
    heightCm,
    heartRateBpm,
    trackingParameters: parameters,
    primaryMuscleGroup: muscleFromField(exercise?.primary_muscle_group),
    secondaryMuscleGroups: musclesFromList(exercise?.secondary_muscle_groups),
    bodyParts: bodyPartsFromList(exercise?.body_parts),
    sets,
    previousSets,
  };
}

function trackingParametersFor(exercise: Record<string, unknown> | null) {
  if (!exercise) return [...LEGACY_TRACKING_PARAMETERS];
  const trackingType = stringField(exercise, "tracking_type");
  return parametersFor(trackingType && isTrackingType(trackingType) ? trackingType : null, exercise.tracking_parameters);
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

function clientNameFrom(record: Record<string, unknown> | null) {
  const client = asRecord(firstRelation(record?.clients));
  const name = [stringField(client, "first_name"), stringField(client, "last_name")].filter(Boolean).join(" ");
  return name || "Client";
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
