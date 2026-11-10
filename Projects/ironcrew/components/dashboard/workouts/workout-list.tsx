"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { WorkoutAssignmentDetail } from "@/components/dashboard/workout-assignment-detail";
import { formatLongDate, isAssignmentStatus, statusLabel } from "@/lib/dashboard/client-week";
import { workoutSourceLabel } from "@/lib/dashboard/workout-source";
import type { WorkoutRow } from "@/lib/dashboard/workout-filters";

export function WorkoutList({
  workouts,
  mode,
}: {
  workouts: WorkoutRow[];
  mode: "client" | "trainer";
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-slate-100">
      {workouts.map((workout) => {
        const open = openId === workout.id;
        return (
          <li key={workout.id} className="py-4 first:pt-0 last:pb-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : workout.id)}
              className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <ChevronRight className={`mt-0.5 size-4 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`} />
                <div className="min-w-0">
                  <p className="text-base font-semibold">{workout.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatLongDate(workout.scheduledFor)}
                    {workout.durationMinutes ? ` · ${workout.durationMinutes} min` : ""}
                    {` · ${workoutSourceLabel(workout)}`}
                  </p>
                </div>
              </div>
              <StatusPill status={workout.status} />
            </button>
            {open ? <WorkoutAssignmentDetail assignmentId={workout.id} mode={mode} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function WorkoutListSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex animate-pulse items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
          <div className="space-y-2">
            <div className="h-4 w-48 max-w-full rounded bg-slate-200" />
            <div className="h-3 w-32 rounded bg-slate-100" />
          </div>
          <div className="h-6 w-20 rounded-full bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = isAssignmentStatus(status) ? statusLabel(status) : status;
  const tone =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "in_progress"
        ? "bg-violet-50 text-violet-700"
        : status === "skipped"
          ? "bg-amber-50 text-amber-700"
          : status === "cancelled"
            ? "bg-slate-100 text-slate-500"
            : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}
