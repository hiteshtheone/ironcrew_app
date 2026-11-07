"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { ClientProgress } from "@/components/dashboard/client-progress";
import { ClientWeek } from "@/components/dashboard/client-dashboard";
import { ClientWorkouts } from "@/components/dashboard/client-workouts";
import { ProgramsPanel } from "@/components/dashboard/programs-panel";
import type { ClientDashboardData } from "@/lib/dashboard/client-week";
import type { TrainerProgramsData } from "@/lib/dashboard/load-trainer-programs";

const VIEWS = ["week", "workouts", "programs", "progress"] as const;
type TrainingView = (typeof VIEWS)[number];

const viewLabel: Record<TrainingView, string> = {
  week: "This week",
  workouts: "Workouts",
  programs: "Programs",
  progress: "Progress",
};

export function TrainerTraining({
  data,
  programs,
}: {
  data: ClientDashboardData;
  programs: TrainerProgramsData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = trainingView(searchParams);

  const openView = (next: TrainingView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "training");
    if (next === "week") params.delete("view");
    else params.set("view", next);
    if (next !== "programs") {
      params.delete("program");
      params.delete("phase");
      params.delete("week");
      params.delete("workout");
      params.delete("exercise");
      params.delete("creating");
    }
    router.replace(`/dashboard?${params.toString()}`);
  };

  if (data.kind === "error") {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">My training</h1>
        <p className="mt-2 text-sm text-slate-500">{data.message}</p>
      </div>
    );
  }

  const workouts = programs.kind === "ready" ? programs.workouts : [];
  const activePrograms = data.kind === "ready" ? data.activePrograms : [];

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <p className="text-sm text-slate-500">
          Programs you follow yourself. Programs you assign to clients stay under Programs.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => openView(id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${view === id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {viewLabel[id]}
            </button>
          ))}
        </div>
      </div>

      {view === "workouts" ? (
        <ClientWorkouts
          data={data}
          emptyMessage="Workouts you schedule for yourself show up here."
        />
      ) : view === "programs" ? (
        <ProgramsPanel
          data={programs}
          mode="client"
          sectionId="training"
          activePrograms={activePrograms}
        />
      ) : view === "progress" ? (
        <ClientProgress data={data} />
      ) : (
        <ClientWeek data={data} workouts={workouts} />
      )}
    </div>
  );
}

function trainingView(searchParams: { get(name: string): string | null }): TrainingView {
  const requested = searchParams.get("view");
  if (requested === "workouts" || requested === "programs" || requested === "progress" || requested === "week") {
    return requested;
  }
  if (searchParams.get("program") || searchParams.get("workout") || searchParams.get("exercise") || searchParams.get("creating")) {
    return "programs";
  }
  return "week";
}
