"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { WorkoutAssignmentDetail } from "@/components/dashboard/workout-assignment-detail";
import { workoutSourceLabel } from "@/lib/dashboard/workout-source";
import type { TrainerSession } from "@/lib/dashboard/load-trainer-dashboard";

export function TodayWorkouts({ sessions }: { sessions: TrainerSession[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <p className="mt-8 text-sm text-slate-500">No workouts scheduled today</p>;
  }

  return (
    <div className="mt-5 divide-y divide-slate-100">
      {sessions.map((session) => {
        const open = openId === session.id;
        return (
          <div key={session.id} className="py-4 first:pt-0 last:pb-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : session.id)}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ${session.tone}`}>
                {session.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{session.clientName}</p>
                <p className="truncate text-xs text-slate-500">{session.workoutName}</p>
                <p className="truncate text-xs text-slate-400">{workoutSourceLabel(session)}</p>
              </div>
              <p className="text-xs font-medium text-slate-500 sm:text-sm">{session.statusLabel}</p>
              <ChevronRight className={`size-5 shrink-0 text-slate-300 transition ${open ? "rotate-90" : ""}`} />
            </button>
            {open ? <WorkoutAssignmentDetail assignmentId={session.id} mode="trainer" /> : null}
          </div>
        );
      })}
    </div>
  );
}
