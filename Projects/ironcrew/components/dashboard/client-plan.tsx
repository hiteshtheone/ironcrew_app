"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { GOAL_TYPE_LABELS, GOAL_TYPES, isGoalType } from "@/lib/plans/constants";
import type { WorkoutOption } from "@/lib/dashboard/load-trainer-programs";

const fieldClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400";

type ClientPlanTarget = {
  id: string;
  name: string;
  goalTitle: string | null;
  goalType: string | null;
  programName: string | null;
  programId: string | null;
  programStartsOn: string | null;
  hasActiveProgram: boolean;
};

type ProgramOption = { id: string; name: string };

export function ClientPlan({
  client,
  programs,
  workouts,
}: {
  client: ClientPlanTarget;
  programs: ProgramOption[];
  workouts: WorkoutOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState("");
  const [goalType, setGoalType] = useState<(typeof GOAL_TYPES)[number]>("strength");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState("");
  const [workoutId, setWorkoutId] = useState(workouts[0]?.id ?? "");
  const [scheduledFor, setScheduledFor] = useState("");
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const backToList = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "clients");
    params.delete("client");
    router.replace(`/dashboard?${params.toString()}`);
  };

  const openProgram = () => {
    if (!client.programId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "programs");
    params.set("program", client.programId);
    params.delete("client");
    router.replace(`/dashboard?${params.toString()}`);
  };

  const submitPlan = (event: FormEvent) => {
    event.preventDefault();
    setPending("plan");
    setError(null);
    setNotice(null);
    void fetch(`/api/clients/${client.id}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        goal_type: goalType,
        target_value: targetValue === "" ? null : Number(targetValue),
        target_unit: targetUnit || null,
        target_date: targetDate || null,
        notes: notes || null,
        program_id: selectedProgramId,
        starts_on: startsOn,
      }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to start this plan");
        setNotice("Goal saved and program assigned.");
        router.refresh();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Unable to start this plan");
      })
      .finally(() => setPending(null));
  };

  const submitWorkout = (event: FormEvent) => {
    event.preventDefault();
    setPending("workout");
    setError(null);
    setNotice(null);
    void fetch(`/api/clients/${client.id}/workouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workout_id: selectedWorkoutId,
        scheduled_for: scheduledFor,
        notes: workoutNotes || null,
      }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to assign this workout");
        setWorkoutNotes("");
        setNotice("Workout assigned on their calendar.");
        router.refresh();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Unable to assign this workout");
      })
      .finally(() => setPending(null));
  };

  const selectedProgramId = programs.some((program) => program.id === programId) ? programId : programs[0]?.id ?? "";
  const selectedWorkoutId = workouts.some((workout) => workout.id === workoutId) ? workoutId : workouts[0]?.id ?? "";
  const goalLabel = client.goalType && isGoalType(client.goalType) ? GOAL_TYPE_LABELS[client.goalType] : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <button type="button" onClick={backToList} className="text-sm font-semibold text-slate-600">
        Back to clients
      </button>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{client.name}</h1>
      <p className="mt-2 text-sm text-slate-500">Set a goal and assign a program, or put a single workout on their calendar.</p>

      {client.hasActiveProgram ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold">Current plan</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Goal</dt>
              <dd className="font-semibold">{client.goalTitle ?? "No goal title"}{goalLabel ? ` · ${goalLabel}` : ""}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Program</dt>
              <dd className="font-semibold">{client.programName ?? "Assigned program"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Starts</dt>
              <dd className="font-semibold">{client.programStartsOn ?? "—"}</dd>
            </div>
          </dl>
          <button type="button" onClick={openProgram} className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
            Edit phases and weeks
          </button>
        </section>
      ) : (
        <form onSubmit={submitPlan} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-lg font-bold">Start their plan</h2>
            <p className="mt-1 text-sm text-slate-500">The goal and program are saved together.</p>
          </div>
          {programs.length === 0 ? (
            <p className="text-sm text-slate-500">Create a program in Programs before assigning one.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-slate-600">Goal</span>
                <input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-600">Goal type</span>
                <select value={goalType} onChange={(event) => { if (isGoalType(event.target.value)) setGoalType(event.target.value); }} className={fieldClass}>
                  {GOAL_TYPES.map((type) => <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-600">Program</span>
                <select required value={selectedProgramId} onChange={(event) => setProgramId(event.target.value)} className={fieldClass}>
                  {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-600">Target</span>
                <input type="number" min="0" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className={fieldClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-600">Unit</span>
                <input maxLength={40} value={targetUnit} onChange={(event) => setTargetUnit(event.target.value)} className={fieldClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-600">Target date</span>
                <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={fieldClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-600">Program starts</span>
                <input required type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className={fieldClass} />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-slate-600">Notes</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm" />
              </label>
              <button type="submit" disabled={pending === "plan"} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">
                {pending === "plan" ? "Saving..." : "Save goal and assign program"}
              </button>
            </div>
          )}
        </form>
      )}

      <form onSubmit={submitWorkout} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-bold">Assign a workout directly</h2>
          <p className="mt-1 text-sm text-slate-500">This does not change the program. It only schedules this client.</p>
        </div>
        {workouts.length === 0 ? (
          <p className="text-sm text-slate-500">No workouts in your library yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Workout</span>
              <select required value={selectedWorkoutId} onChange={(event) => setWorkoutId(event.target.value)} className={fieldClass}>
                {workouts.map((workout) => <option key={workout.id} value={workout.id}>{workout.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Date</span>
              <input required type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-600">Notes</span>
              <input value={workoutNotes} onChange={(event) => setWorkoutNotes(event.target.value)} className={fieldClass} />
            </label>
            <button type="submit" disabled={pending === "workout"} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-60 sm:col-span-2">
              {pending === "workout" ? "Assigning..." : "Assign workout"}
            </button>
          </div>
        )}
      </form>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-emerald-700">{notice}</p> : null}
    </div>
  );
}
