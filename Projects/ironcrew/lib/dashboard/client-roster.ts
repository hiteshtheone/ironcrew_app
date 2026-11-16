import type { AssignmentStatus } from "@/lib/dashboard/client-week";

export type RosterAssignment = {
  clientId: string;
  scheduledFor: string;
  status: AssignmentStatus;
  workoutName: string;
};

export type RosterMonths = {
  thisStart: string;
  thisEnd: string;
  previousStart: string;
  previousEnd: string;
};

export type ClientRosterSignal = {
  /** Completed share of this month's non-cancelled workouts. Null when none were scheduled. */
  consistencyPercent: number | null;
  /** Change versus last month, or "No workouts this month" when this month is empty. */
  consistencyDelta: string;
  lastWorkoutName: string | null;
  lastWorkoutOn: string | null;
};

/**
 * Consistency uses the month window only. Last workout uses completed history,
 * which can be older than that window, so the two lists stay separate.
 */
export function clientRosterSignal(
  windowAssignments: RosterAssignment[],
  completedAssignments: RosterAssignment[],
  months: RosterMonths,
  today: string,
): ClientRosterSignal {
  const current = rate(inRange(windowAssignments, months.thisStart, months.thisEnd));
  const previous = rate(inRange(windowAssignments, months.previousStart, months.previousEnd));
  const last = lastCompleted(completedAssignments, today);

  return {
    consistencyPercent: current.percent,
    consistencyDelta: current.percent === null ? "No workouts this month" : signedDelta(current.percent, previous.percent),
    lastWorkoutName: last?.workoutName ?? null,
    lastWorkoutOn: last?.scheduledFor ?? null,
  };
}

function inRange(assignments: RosterAssignment[], start: string, end: string) {
  return assignments.filter((assignment) => assignment.scheduledFor >= start && assignment.scheduledFor <= end);
}

function rate(assignments: RosterAssignment[]) {
  const active = assignments.filter((assignment) => assignment.status !== "cancelled");
  const completed = active.filter((assignment) => assignment.status === "completed").length;
  return {
    percent: active.length === 0 ? null : Math.round((completed / active.length) * 100),
  };
}

function signedDelta(current: number, previous: number | null) {
  if (previous === null) return "New";
  const delta = current - previous;
  if (delta > 0) return `+${delta}%`;
  if (delta < 0) return `${delta}%`;
  return "0%";
}

function lastCompleted(assignments: RosterAssignment[], today: string) {
  let best: RosterAssignment | null = null;
  for (const assignment of assignments) {
    if (assignment.status !== "completed" || assignment.scheduledFor > today) continue;
    if (!best || assignment.scheduledFor > best.scheduledFor) best = assignment;
  }
  return best;
}
