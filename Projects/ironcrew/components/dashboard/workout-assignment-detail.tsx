"use client";

import { useEffect, useState } from "react";

import { WorkoutLog } from "@/components/dashboard/workout-log";
import {
  formatLongDate,
  muscleGroupLabel,
  statusLabel,
  type ClientLoggedSet,
  type ClientWorkout,
} from "@/lib/dashboard/client-week";
import type { AssignmentDetail } from "@/lib/dashboard/load-client-dashboard";
import { tracks, type TrackingParameter } from "@/lib/exercises/tracking";

const LOAD_ERROR = "Couldn't load this workout";

export function WorkoutAssignmentDetail({
  assignmentId,
  mode,
}: {
  assignmentId: string;
  mode: "client" | "trainer";
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    id: string;
    attempt: number;
    detail: AssignmentDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/workout-assignments/${assignmentId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (Partial<AssignmentDetail> & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error || LOAD_ERROR);
        if (!isAssignmentDetail(body)) throw new Error(LOAD_ERROR);
        setState({ id: assignmentId, attempt, detail: body, error: null });
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setState({
          id: assignmentId,
          attempt,
          detail: null,
          error: caught instanceof Error ? caught.message : LOAD_ERROR,
        });
      });

    return () => controller.abort();
  }, [assignmentId, attempt]);

  const settled = state?.id === assignmentId && state.attempt === attempt;

  if (!settled) {
    return <p className="mt-4 text-sm text-slate-500">Loading workout…</p>;
  }

  if (state.error || !state.detail) {
    return (
      <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-red-600">{state.error ?? LOAD_ERROR}</p>
        <button
          type="button"
          onClick={() => setAttempt((current) => current + 1)}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
        >
          Try again
        </button>
      </div>
    );
  }

  return <WorkoutDetailBody detail={state.detail} mode={mode} />;
}

export function AssignmentFacts({
  workout,
  scheduledFor,
  clientName,
}: {
  workout: ClientWorkout;
  scheduledFor?: string;
  clientName?: string | null;
}) {
  return (
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      {scheduledFor ? <Fact label="Scheduled" value={formatLongDate(scheduledFor)} /> : null}
      <Fact label="Status" value={statusLabel(workout.status)} />
      <Fact label="Duration" value={workout.durationMinutes ? `${workout.durationMinutes} min` : "—"} />
      <Fact label="Program" value={workout.programName ?? "No program"} />
      <Fact label="Assigned by" value={workout.givenBy} />
      {clientName ? <Fact label="Client" value={clientName} /> : null}
    </dl>
  );
}

function WorkoutDetailBody({ detail, mode }: { detail: AssignmentDetail; mode: "client" | "trainer" }) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-900">Assignment</h3>
      <AssignmentFacts
        workout={detail.workout}
        scheduledFor={detail.scheduledFor}
        clientName={mode === "trainer" ? detail.clientName : null}
      />
      <h3 className="mt-5 text-sm font-semibold text-slate-900">Execution</h3>
      {mode === "client" ? (
        <WorkoutLog workout={detail.workout} />
      ) : (
        <ReadOnlyExecution workout={detail.workout} />
      )}
    </div>
  );
}

function ReadOnlyExecution({ workout }: { workout: ClientWorkout }) {
  return (
    <div className="mt-3 space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-500">Session note</p>
        <p className="mt-1 text-sm text-slate-700">{workout.sessionNote?.trim() || "No note"}</p>
      </div>
      {workout.exercises.length === 0 ? (
        <p className="text-sm text-slate-500">No blocks listed for this workout.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {workout.exercises.map((exercise, index) => {
            const muscles = muscleGroupLabel(exercise.primaryMuscleGroup, exercise.secondaryMuscleGroup);
            return (
              <li key={exercise.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{exercise.name}</p>
                    {muscles ? <p className="text-xs text-slate-500">{muscles}</p> : null}
                    <p className="text-xs text-slate-500">
                      {exercise.detail ? `Prescribed: ${exercise.detail}` : "No prescription"}
                    </p>
                    {exercise.sets.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">Nothing logged</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {exercise.sets.map((set) => (
                          <li key={set.setNumber} className="text-sm text-slate-700">
                            <span className="font-semibold">Set {set.setNumber}</span>
                            {` · ${formatLoggedSet(set, exercise.trackingParameters)}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function formatLoggedSet(set: ClientLoggedSet, parameters: TrackingParameter[]) {
  const parts: string[] = [];
  if (tracks(parameters, "weight") && set.load != null) {
    parts.push(set.loadUnit ? `${set.load} ${set.loadUnit}` : String(set.load));
  }
  if (tracks(parameters, "reps") && set.repetitions != null) parts.push(`${set.repetitions} reps`);
  if (tracks(parameters, "time") && set.durationSeconds != null) parts.push(`${set.durationSeconds} sec`);
  if (tracks(parameters, "distance") && set.distanceMeters != null) {
    parts.push(`${metersToKm(set.distanceMeters)} km`);
  }
  if (tracks(parameters, "height") && set.heightCm != null) parts.push(`${set.heightCm} cm`);
  if (tracks(parameters, "heart_rate") && set.heartRateBpm != null) parts.push(`${set.heartRateBpm} bpm`);
  if (set.notes) parts.push(set.notes);
  return parts.join(" · ") || "Logged";
}

function metersToKm(meters: number) {
  return String(Math.round((meters / 1000) * 1000) / 1000);
}

function isAssignmentDetail(value: unknown): value is AssignmentDetail {
  if (!value || typeof value !== "object") return false;
  const record = value as AssignmentDetail;
  return (
    typeof record.scheduledFor === "string" &&
    typeof record.clientName === "string" &&
    record.workout != null &&
    typeof record.workout === "object" &&
    typeof record.workout.id === "string" &&
    typeof record.workout.name === "string" &&
    Array.isArray(record.workout.exercises)
  );
}
