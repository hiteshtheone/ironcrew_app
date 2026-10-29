"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ActiveProgramWarning } from "@/components/dashboard/active-program-warning";
import { DeleteControl, EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import type { ActiveProgramSummary } from "@/lib/api/active-programs";
import type { ClientGoal, ClientWorkoutLog } from "@/lib/dashboard/load-client-list";
import { muscleGroupLabel } from "@/lib/dashboard/client-week";
import { libraryItemLabel, type WorkoutOption } from "@/lib/dashboard/load-trainer-programs";
import { workoutSourceLabel } from "@/lib/dashboard/workout-source";
import { GOAL_STATUS_LABELS, GOAL_STATUSES, GOAL_TYPE_LABELS, GOAL_TYPES, isGoalStatus, isGoalType } from "@/lib/plans/constants";

const fieldClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50";

type PlanDraft = {
  title: string;
  goalType: (typeof GOAL_TYPES)[number];
  targetValue: string;
  targetUnit: string;
  targetDate: string;
  notes: string;
  programId: string;
  startsOn: string;
};

type GoalDraft = {
  title: string;
  goalType: (typeof GOAL_TYPES)[number];
  status: (typeof GOAL_STATUSES)[number];
  targetValue: string;
  targetUnit: string;
  targetDate: string;
  notes: string;
};

type ClientPlanTarget = {
  id: string;
  name: string;
  goalTitle: string | null;
  goalType: string | null;
  linkedGoalId: string | null;
  goals: ClientGoal[];
  programName: string | null;
  programId: string | null;
  programStartsOn: string | null;
  hasActiveProgram: boolean;
  activePrograms: ActiveProgramSummary[];
  workoutLogs: ClientWorkoutLog[];
};

type ProgramOption = { id: string; name: string; isSystem?: boolean };

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
  // Set when the server reports an active program the page did not know about.
  const [conflict, setConflict] = useState<ActiveProgramSummary[] | null>(null);
  const [planBaseline, setPlanBaseline] = useState<PlanDraft>(() => ({
    title: "",
    goalType: "strength",
    targetValue: "",
    targetUnit: "",
    targetDate: "",
    notes: "",
    programId: programs[0]?.id ?? "",
    startsOn: "",
  }));
  const { editing: editingPlan, startEditing: startPlanEdit, stopEditing: stopPlanEdit } = useEditMode(client.id);
  const selectedProgramId = programs.some((program) => program.id === programId) ? programId : programs[0]?.id ?? "";
  const planDraft: PlanDraft = {
    title,
    goalType,
    targetValue,
    targetUnit,
    targetDate,
    notes,
    programId: selectedProgramId,
    startsOn,
  };
  const planDirty = !valuesEqual(planDraft, planBaseline);

  // Warn whenever the client already has an active program. Submitting the form
  // after the warning is shown is the confirmation to add another.
  const overlapPrograms = conflict ?? (client.activePrograms.length > 0 ? client.activePrograms : null);

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

  const cancelPlanEdit = () => {
    setTitle(planBaseline.title);
    setGoalType(planBaseline.goalType);
    setTargetValue(planBaseline.targetValue);
    setTargetUnit(planBaseline.targetUnit);
    setTargetDate(planBaseline.targetDate);
    setNotes(planBaseline.notes);
    setProgramId(planBaseline.programId);
    setStartsOn(planBaseline.startsOn);
    setError(null);
    stopPlanEdit();
  };

  const submitPlan = (event: FormEvent) => {
    event.preventDefault();
    if (!editingPlan || !planDirty) return;
    setPending("plan");
    setError(null);
    setNotice(null);
    const confirmOverlap = overlapPrograms !== null;
    const savedPlan = planDraft;
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
        confirmOverlap,
      }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (response.status === 409 && payload.code === "active_program_exists") {
          setConflict(Array.isArray(payload.activePrograms) ? payload.activePrograms : []);
          return;
        }
        if (!response.ok) throw new Error(payload.error || "Unable to start this plan");
        setConflict(null);
        setPlanBaseline(savedPlan);
        stopPlanEdit();
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

  const deleteClient = () => {
    setPending("delete-client");
    setError(null);
    setNotice(null);
    void fetch(`/api/clients/${client.id}`, { method: "DELETE" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Unable to delete this client");
        backToList();
        router.refresh();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Unable to delete this client");
      })
      .finally(() => setPending(null));
  };

  const selectedWorkoutId = workouts.some((workout) => workout.id === workoutId) ? workoutId : workouts[0]?.id ?? "";
  const goalLabel = client.goalType && isGoalType(client.goalType) ? GOAL_TYPE_LABELS[client.goalType] : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <button type="button" onClick={backToList} className="text-sm font-semibold text-slate-600">
        Back to clients
      </button>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
        <DeleteControl
          key={client.id}
          itemLabel="client"
          detail={`Delete ${client.name}? Their goals, program assignments, and calendar go with them. This cannot be undone.`}
          pending={pending === "delete-client"}
          disabled={pending !== null && pending !== "delete-client"}
          onDelete={deleteClient}
        />
      </div>
      <p className="mt-2 text-sm text-slate-500">Set a goal and assign a program, or put a single workout on their calendar.</p>

      <WorkoutDetails logs={client.workoutLogs} />

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
      ) : null}

      <form onSubmit={submitPlan} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-bold">{overlapPrograms ? "Add another program" : "Start their plan"}</h2>
          <p className="mt-1 text-sm text-slate-500">The goal and program are saved together.</p>
        </div>
        {programs.length === 0 ? (
          <p className="text-sm text-slate-500">Create a program in Programs before assigning one.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-600">Goal</span>
              <input required maxLength={160} disabled={!editingPlan} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Goal type</span>
              <select disabled={!editingPlan} value={goalType} onChange={(event) => { if (isGoalType(event.target.value)) setGoalType(event.target.value); }} className={fieldClass}>
                {GOAL_TYPES.map((type) => <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Program</span>
              <select required disabled={!editingPlan} value={selectedProgramId} onChange={(event) => setProgramId(event.target.value)} className={fieldClass}>
                {programs.map((program) => <option key={program.id} value={program.id}>{libraryItemLabel(program.name, program.isSystem === true)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Target</span>
              <input type="number" min="0" step="any" disabled={!editingPlan} value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Unit</span>
              <input maxLength={40} disabled={!editingPlan} value={targetUnit} onChange={(event) => setTargetUnit(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Target date</span>
              <input type="date" disabled={!editingPlan} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Program starts</span>
              <input required type="date" disabled={!editingPlan} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-600">Notes</span>
              <textarea value={notes} disabled={!editingPlan} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50" />
            </label>
            {overlapPrograms ? <ActiveProgramWarning programs={overlapPrograms} audience="trainer" /> : null}
            <EditSaveActions
              className="flex flex-wrap items-center gap-2 sm:col-span-2"
              editing={editingPlan}
              dirty={planDirty}
              pending={pending === "plan"}
              saveLabel={overlapPrograms ? "Assign anyway" : "Save goal and assign program"}
              saveClassName="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              editClassName="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onEdit={startPlanEdit}
              onCancel={cancelPlanEdit}
            />
          </div>
        )}
      </form>

      <form onSubmit={submitWorkout} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-bold">Assign a workout directly</h2>
          <p className="mt-1 text-sm text-slate-500">This does not change the program. It only schedules this client.</p>
        </div>
        {workouts.length === 0 ? (
          <p className="text-sm text-slate-500">No workouts in your library yet. Add one under Programs. You don&apos;t need a program first.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-600">Workout</span>
              <select required value={selectedWorkoutId} onChange={(event) => setWorkoutId(event.target.value)} className={fieldClass}>
                {workouts.map((workout) => <option key={workout.id} value={workout.id}>{libraryItemLabel(workout.name, workout.isSystem)}</option>)}
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

      <GoalEditor
        clientId={client.id}
        goals={client.goals}
        linkedGoalId={client.linkedGoalId}
        onDuplicated={() => {
          setNotice("Goal duplicated. The program assignment is unchanged.");
          setError(null);
        }}
        onSaved={() => {
          setNotice("Goal saved.");
          setError(null);
        }}
        onDeleted={() => {
          setNotice("Goal deleted.");
          setError(null);
        }}
        onError={(message) => {
          setError(message);
          setNotice(null);
        }}
      />

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-emerald-700">{notice}</p> : null}
    </div>
  );
}

function WorkoutDetails({ logs }: { logs: ClientWorkoutLog[] }) {
  const visible = logs.filter((log) => log.status !== "cancelled");

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold">Workout details</h2>
      <p className="mt-1 text-sm text-slate-500">What this client logged for the current week.</p>
      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No workouts scheduled this week.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {visible.map((log) => (
            <article key={log.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{log.workoutName}</p>
                  <p className="mt-1 text-xs text-slate-500">{log.dateLabel} · {workoutSourceLabel(log)}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{log.statusLabel}</span>
              </div>
              {log.note ? <p className="mt-3 text-sm text-slate-700">{log.note}</p> : null}
              {log.blocks.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No blocks in this workout.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {log.blocks.map((block) => {
                    const muscles = muscleGroupLabel(block.primaryMuscleGroup, block.secondaryMuscleGroup);
                    return (
                    <li key={block.id}>
                      <p className="text-sm font-medium">{block.name}</p>
                      {muscles ? <p className="text-xs text-slate-500">{muscles}</p> : null}
                      {block.sets.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-500">No details logged.</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {block.sets.map((set) => (
                            <li key={set.setNumber} className="text-xs text-slate-600">
                              {setSummary(set)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function goalDraftFrom(goal: ClientGoal | null): GoalDraft {
  return {
    title: goal?.title ?? "",
    goalType: goal && isGoalType(goal.goalType) ? goal.goalType : "strength",
    status: goal && isGoalStatus(goal.status) ? goal.status : "active",
    targetValue: goal?.targetValue == null ? "" : String(goal.targetValue),
    targetUnit: goal?.targetUnit ?? "",
    targetDate: goal?.targetDate ?? "",
    notes: goal?.notes ?? "",
  };
}

function setSummary(set: ClientWorkoutLog["blocks"][number]["sets"][number]) {
  const parts = [`Set ${set.setNumber}`];
  if (set.load != null) parts.push(set.loadUnit ? `${set.load} ${set.loadUnit}` : String(set.load));
  if (set.repetitions != null) parts.push(`${set.repetitions} reps`);
  if (set.durationSeconds != null) parts.push(`${set.durationSeconds} sec`);
  if (set.distanceMeters != null) parts.push(`${Math.round((set.distanceMeters / 1000) * 1000) / 1000} km`);
  if (set.heightCm != null) parts.push(`${set.heightCm} cm`);
  if (set.notes) parts.push(set.notes);
  return parts.join(" · ");
}

function GoalEditor({
  clientId,
  goals,
  linkedGoalId,
  onDuplicated,
  onSaved,
  onDeleted,
  onError,
}: {
  clientId: string;
  goals: ClientGoal[];
  linkedGoalId: string | null;
  onDuplicated: (goalId: string) => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const initialId = linkedGoalId ?? goals[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initialId);
  const visibleId = goals.some((goal) => goal.id === selectedId) ? selectedId : initialId;
  const visibleGoal = goals.find((goal) => goal.id === visibleId) ?? null;
  const [loadedId, setLoadedId] = useState(visibleId);
  const [title, setTitle] = useState(visibleGoal?.title ?? "");
  const [goalType, setGoalType] = useState<(typeof GOAL_TYPES)[number]>(
    visibleGoal && isGoalType(visibleGoal.goalType) ? visibleGoal.goalType : "strength",
  );
  const [status, setStatus] = useState<(typeof GOAL_STATUSES)[number]>(
    visibleGoal && isGoalStatus(visibleGoal.status) ? visibleGoal.status : "active",
  );
  const [targetValue, setTargetValue] = useState(visibleGoal?.targetValue == null ? "" : String(visibleGoal.targetValue));
  const [targetUnit, setTargetUnit] = useState(visibleGoal?.targetUnit ?? "");
  const [targetDate, setTargetDate] = useState(visibleGoal?.targetDate ?? "");
  const [notes, setNotes] = useState(visibleGoal?.notes ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [goalBaseline, setGoalBaseline] = useState<GoalDraft>(() => goalDraftFrom(visibleGoal));
  const { editing, startEditing, stopEditing } = useEditMode(visibleId);
  const selected = goals.find((goal) => goal.id === selectedId) ?? visibleGoal;

  if (visibleId !== loadedId) {
    const next = goalDraftFrom(visibleGoal);
    setLoadedId(visibleId);
    setTitle(next.title);
    setGoalType(next.goalType);
    setStatus(next.status);
    setTargetValue(next.targetValue);
    setTargetUnit(next.targetUnit);
    setTargetDate(next.targetDate);
    setNotes(next.notes);
    setGoalBaseline(next);
  }

  const goalDraft: GoalDraft = { title, goalType, status, targetValue, targetUnit, targetDate, notes };
  const goalDirty = !valuesEqual(goalDraft, goalBaseline);

  const duplicate = () => {
    if (!selected) return;
    setPending("duplicate-goal");
    void fetch(`/api/goals/${selected.id}/duplicate`, { method: "POST" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to duplicate this goal");
        if (typeof payload.id === "string") {
          setSelectedId(payload.id);
          onDuplicated(payload.id);
        }
        router.refresh();
      })
      .catch((caught: unknown) => {
        onError(caught instanceof Error ? caught.message : "Unable to duplicate this goal");
      })
      .finally(() => setPending(null));
  };

  const cancelGoalEdit = () => {
    setTitle(goalBaseline.title);
    setGoalType(goalBaseline.goalType);
    setStatus(goalBaseline.status);
    setTargetValue(goalBaseline.targetValue);
    setTargetUnit(goalBaseline.targetUnit);
    setTargetDate(goalBaseline.targetDate);
    setNotes(goalBaseline.notes);
    stopEditing();
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !editing || !goalDirty) return;
    const savedGoal = goalDraft;
    setPending("save-goal");
    void fetch(`/api/clients/${clientId}/goals/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        goal_type: goalType,
        status,
        target_value: targetValue === "" ? null : Number(targetValue),
        target_unit: targetUnit || null,
        target_date: targetDate || null,
        notes: notes || null,
      }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to save this goal");
        setGoalBaseline(savedGoal);
        stopEditing();
        onSaved();
        router.refresh();
      })
      .catch((caught: unknown) => {
        onError(caught instanceof Error ? caught.message : "Unable to save this goal");
      })
      .finally(() => setPending(null));
  };

  const removeGoal = () => {
    if (!selected || pending !== null) return;
    setPending("delete-goal");
    void fetch(`/api/clients/${clientId}/goals/${selected.id}`, { method: "DELETE" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Unable to delete this goal");
        onDeleted();
        router.refresh();
      })
      .catch((caught: unknown) => {
        onError(caught instanceof Error ? caught.message : "Unable to delete this goal");
      })
      .finally(() => setPending(null));
  };

  return (
    <form onSubmit={save} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Goals</h2>
          <p className="mt-1 text-sm text-slate-500">Duplicating a goal keeps the current program assignment.</p>
        </div>
        <button
          type="button"
          onClick={duplicate}
          disabled={!selected || pending === "duplicate-goal"}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending === "duplicate-goal" ? "Duplicating..." : "Duplicate goal"}
        </button>
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-slate-500">This client has no goal yet. Start their plan to create one.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-slate-600">Saved goals</span>
            <select value={visibleId} onChange={(event) => setSelectedId(event.target.value)} className={fieldClass}>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}{goal.id === linkedGoalId ? " · on this program" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-slate-600">Title</span>
            <input required maxLength={160} disabled={!editing} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Type</span>
            <select disabled={!editing} value={goalType} onChange={(event) => { if (isGoalType(event.target.value)) setGoalType(event.target.value); }} className={fieldClass}>
              {GOAL_TYPES.map((type) => <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Status</span>
            <select disabled={!editing} value={status} onChange={(event) => { if (isGoalStatus(event.target.value)) setStatus(event.target.value); }} className={fieldClass}>
              {GOAL_STATUSES.map((item) => <option key={item} value={item}>{GOAL_STATUS_LABELS[item]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Target</span>
            <input type="number" min="0" step="any" disabled={!editing} value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className={fieldClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Unit</span>
            <input maxLength={40} disabled={!editing} value={targetUnit} onChange={(event) => setTargetUnit(event.target.value)} className={fieldClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-600">Target date</span>
            <input type="date" disabled={!editing} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={fieldClass} />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-slate-600">Notes</span>
            <textarea value={notes} disabled={!editing} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50" />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <EditSaveActions
              editing={editing}
              dirty={goalDirty}
              pending={pending === "save-goal"}
              saveLabel="Save goal"
              saveClassName="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              editClassName="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onEdit={startEditing}
              onCancel={cancelGoalEdit}
            />
            <DeleteControl
              key={visibleId}
              itemLabel="goal"
              detail={`Delete ${visibleGoal?.title ?? "this goal"}? The program assignment stays, without this goal. This cannot be undone.`}
              pending={pending === "delete-goal"}
              disabled={pending !== null && pending !== "delete-goal"}
              onDelete={removeGoal}
            />
          </div>
        </div>
      )}
    </form>
  );
}
