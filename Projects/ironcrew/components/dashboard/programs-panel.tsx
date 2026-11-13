"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ActiveProgramWarning } from "@/components/dashboard/active-program-warning";
import { ExerciseEditor } from "@/components/dashboard/exercise-editor";
import { WorkoutEditor } from "@/components/dashboard/workout-editor";
import { DeleteControl, EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import type { ActiveProgramSummary } from "@/lib/api/active-programs";
import { libraryItemLabel, type ExerciseOption, type TrainerProgramsData } from "@/lib/dashboard/load-trainer-programs";
import { MUSCLE_LABELS } from "@/lib/exercises/muscle-group";
import { TRACKING_TYPE_LABELS } from "@/lib/exercises/tracking";
import { GOAL_TYPE_LABELS, GOAL_TYPES, isGoalType, type GoalType } from "@/lib/plans/constants";

const fieldClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50";

function activeWeekId(data: TrainerProgramsData, searchParams: { get(name: string): string | null }) {
  if (data.kind !== "ready") return null;
  const selected = data.programs.find((program) => program.id === searchParams.get("program"));
  const phase = selected?.phases.find((item) => item.id === searchParams.get("phase")) ?? selected?.phases[0];
  const week = phase?.weeks.find((item) => item.id === searchParams.get("week")) ?? phase?.weeks[0];
  return week?.id ?? null;
}

export type AssignableClient = {
  id: string;
  name: string;
  activePrograms: ActiveProgramSummary[];
};

export function ProgramsPanel({
  data,
  mode = "trainer",
  activePrograms = [],
  clients = [],
  clientsError = null,
}: {
  data: TrainerProgramsData;
  /** "client" lets a client build and run programs for themselves. */
  mode?: "trainer" | "client";
  /** Programs the signed-in client already has active (client mode only). */
  activePrograms?: ActiveProgramSummary[];
  /** Trainer's clients, used to assign the selected program. */
  clients?: AssignableClient[];
  /** Set when the trainer's client list could not be loaded. */
  clientsError?: string | null;
}) {
  const isClient = mode === "client";
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedProgram = data.kind === "ready"
    ? data.programs.find((program) => program.id === searchParams.get("program")) ?? null
    : null;
  const [draftName, setDraftName] = useState(selectedProgram?.name ?? "");
  const [draftDescription, setDraftDescription] = useState(selectedProgram?.description ?? "");
  const [addingPhase, setAddingPhase] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [checkedClients, setCheckedClients] = useState<string[] | null>(null);
  const [dayOverrides, setDayOverrides] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [showSystemPrograms, setShowSystemPrograms] = useState(true);
  const [showSystemWorkouts, setShowSystemWorkouts] = useState(true);
  const [showSystemExercises, setShowSystemExercises] = useState(true);
  // Set when the server reports an active program the page did not know about.
  const [conflict, setConflict] = useState<ActiveProgramSummary[] | null>(null);
  const selectedProgramId = selectedProgram?.id ?? null;
  const { editing: editingProgram, startEditing: startProgramEdit, stopEditing: stopProgramEdit } = useEditMode(selectedProgramId ?? "");
  const editingProgramRef = useRef(false);
  editingProgramRef.current = editingProgram;
  const [programOverride, setProgramOverride] = useState<{ id: string; name: string; description: string } | null>(null);

  useEffect(() => {
    if (editingProgramRef.current) return;
    const name = selectedProgram?.name ?? "";
    const description = selectedProgram?.description ?? "";
    setDraftName(name);
    setDraftDescription(description);
    setProgramOverride((current) => {
      if (!current || current.id !== selectedProgram?.id) return null;
      return { id: current.id, name, description };
    });
  }, [selectedProgram?.id, selectedProgram?.name, selectedProgram?.description]);

  useEffect(() => {
    setCheckedClients(null);
    setConflict(null);
    setAddingPhase(false);
  }, [selectedProgramId]);

  const selectedWeekId = activeWeekId(data, searchParams);
  useEffect(() => {
    setDayOverrides({});
  }, [selectedWeekId]);

  if (data.kind === "error") {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{isClient ? "My programs" : "Programs"}</h1>
        <p className="mt-2 text-sm text-slate-500">{data.message}</p>
      </div>
    );
  }

  const selectedId = searchParams.get("program");
  const selectedWorkoutId = searchParams.get("workout");
  const selectedExerciseId = searchParams.get("exercise");
  const creating = creationKind(searchParams.get("creating"));
  const visiblePrograms = data.programs.filter((program) => showSystemPrograms || !program.isSystem);
  const visibleWorkouts = data.workouts.filter((workout) => showSystemWorkouts || !workout.isSystem);
  const visibleExercises = data.exercises.filter((exercise) => showSystemExercises || !exercise.isSystem);
  const selected = data.programs.find((program) => program.id === selectedId) ?? null;
  const selectedExercise = data.exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;
  const requestedPhase = selected?.phases.find((item) => item.id === searchParams.get("phase"));
  const phase = requestedPhase ?? selected?.phases[0] ?? null;
  const week = phase?.weeks.find((item) => item.id === searchParams.get("week")) ?? phase?.weeks[0] ?? null;
  const assignedIds = selected?.assignedClients.map((client) => client.id) ?? [];
  const selectedClientIds = (checkedClients ?? assignedIds).filter((id) => assignedIds.includes(id));

  const openProgram = (programId: string, phaseId?: string, weekId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "programs");
    params.set("program", programId);
    if (phaseId) params.set("phase", phaseId);
    else params.delete("phase");
    if (weekId) params.set("week", weekId);
    else params.delete("week");
    params.delete("workout");
    params.delete("exercise");
    params.delete("creating");
    router.replace(`/dashboard?${params.toString()}`);
  };

  const openWorkout = (workoutId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "programs");
    params.set("workout", workoutId);
    params.delete("program");
    params.delete("phase");
    params.delete("week");
    params.delete("exercise");
    params.delete("creating");
    router.replace(`/dashboard?${params.toString()}`);
  };

  const openExercise = (exerciseId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "programs");
    params.set("exercise", exerciseId);
    params.delete("program");
    params.delete("phase");
    params.delete("week");
    params.delete("workout");
    params.delete("creating");
    router.replace(`/dashboard?${params.toString()}`);
  };

  const openCreate = (kind: CreationKind) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "programs");
    params.set("creating", kind);
    params.delete("program");
    params.delete("phase");
    params.delete("week");
    params.delete("workout");
    params.delete("exercise");
    router.replace(`/dashboard?${params.toString()}`);
  };

  const closeCreate = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("creating");
    router.replace(`/dashboard?${params.toString()}`);
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      return false;
    } finally {
      setPending(null);
    }
  };

  const programBaseline = selected && programOverride?.id === selected.id
    ? programOverride
    : { name: selected?.name ?? "", description: selected?.description ?? "" };
  const programDirty = !valuesEqual(
    { name: draftName, description: draftDescription },
    { name: programBaseline.name, description: programBaseline.description },
  );

  const cancelProgramEdit = () => {
    setDraftName(programBaseline.name);
    setDraftDescription(programBaseline.description);
    setError(null);
    stopProgramEdit();
  };

  const saveProgram = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !editingProgram || !programDirty) return;
    const savedName = draftName;
    const savedDescription = draftDescription;
    void run("save-program", async () => {
      await patchJson(`/api/programs/${selected.id}`, {
        name: draftName,
        description: draftDescription.trim() || null,
      });
      setNotice("Program saved.");
    }).then((saved) => {
      if (!saved) return;
      setProgramOverride({ id: selected.id, name: savedName, description: savedDescription });
      stopProgramEdit();
    });
  };

  const deleteProgram = () => {
    if (!selected) return;
    void run("delete-program", async () => {
      const response = await fetch(`/api/programs/${selected.id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to delete this program");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("program");
      params.delete("phase");
      params.delete("week");
      router.replace(`/dashboard?${params.toString()}`);
      setNotice("Program deleted.");
    });
  };

  const duplicateProgram = () => {
    if (!selected) return;
    void run("duplicate-program", async () => {
      const payload = await postJson(`/api/programs/${selected.id}/duplicate`, {});
      if (typeof payload.id === "string") openProgram(payload.id);
      setNotice("Program duplicated. It uses the same workouts.");
    });
  };

  const createProgram = (name: string, description: string) => {
    void run("create-program", async () => {
      const payload = await postJson("/api/programs", { name, description: description.trim() || null });
      if (typeof payload.id === "string") openProgram(payload.id);
    });
  };

  const createWorkout = (body: Record<string, unknown>) =>
    run("create-workout", async () => {
      const payload = await postJson("/api/workouts", { name: body.name });
      if (typeof payload.id !== "string") throw new Error("Unable to create this workout");
      const hasDetails =
        (typeof body.description === "string" && body.description.length > 0)
        || body.estimated_duration_minutes != null
        || (Array.isArray(body.blocks) && body.blocks.length > 0);
      if (hasDetails) {
        try {
          await patchJson(`/api/workouts/${payload.id}`, body);
        } catch (caught) {
          openWorkout(payload.id);
          router.refresh();
          throw caught;
        }
      }
      openWorkout(payload.id);
    });

  const createExercise = (body: Record<string, unknown>) =>
    run("create-exercise", async () => {
      const payload = await postJson("/api/exercises", body);
      if (typeof payload.id === "string") openExercise(payload.id);
    });

  const createPhase = (name: string, description: string) => {
    if (!selected) return;
    void run("phase", async () => {
      const payload = await postJson(`/api/programs/${selected.id}/phases`, {
        name,
        description: description.trim() || null,
      });
      if (typeof payload.id === "string") openProgram(selected.id, payload.id);
    }).then((created) => {
      if (created) setAddingPhase(false);
    });
  };

  const assignProgram = (input: {
    clientIds: string[];
    startsOn: string;
    goalTitle: string;
    goalType: GoalType;
    confirmOverlap: boolean;
  }) => {
    if (!selected) return Promise.resolve(false);
    const title = input.goalTitle.trim() || selected.name;
    return run("assign-program", async () => {
      let assigned = 0;
      try {
        for (const clientId of input.clientIds) {
          const response = await fetch(`/api/clients/${clientId}/plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              goal_type: input.goalType,
              target_value: null,
              target_unit: null,
              target_date: null,
              notes: null,
              program_id: selected.id,
              starts_on: input.startsOn,
              confirmOverlap: input.confirmOverlap,
            }),
          });
          const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
          if (!response.ok) throw new Error(payload?.error || "Unable to assign this program");
          assigned += 1;
        }
      } catch (caught) {
        if (assigned > 0) router.refresh();
        throw caught;
      }
      setNotice(
        `Assigned to ${input.clientIds.length} client${input.clientIds.length === 1 ? "" : "s"}.`,
      );
    });
  };

  const createWeek = () => {
    if (!selected || !phase) return;
    void run("week", async () => {
      const payload = await postJson(`/api/programs/phases/${phase.id}/weeks`, { name: null });
      if (typeof payload.id === "string") openProgram(selected.id, phase.id, payload.id);
    });
  };

  const saveDay = (dayNumber: number, workoutId: string) => {
    if (!week) return;
    setDayOverrides((current) => ({ ...current, [dayNumber]: workoutId }));
    void run(`day-${dayNumber}`, async () => {
      try {
        if (!workoutId) {
          const response = await fetch(
            `/api/programs/weeks/${week.id}/workouts?day_number=${dayNumber}&position=1`,
            { method: "DELETE" },
          );
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Unable to clear this day");
          return;
        }
        await postJson(`/api/programs/weeks/${week.id}/workouts`, {
          workout_id: workoutId,
          day_number: dayNumber,
          position: 1,
        });
      } catch (caught) {
        setDayOverrides((current) => {
          const next = { ...current };
          delete next[dayNumber];
          return next;
        });
        throw caught;
      }
    });
  };

  const publishWeek = (event: FormEvent) => {
    event.preventDefault();
    if (!week) return;
    void run("publish", async () => {
      const payload = await postJson(`/api/programs/weeks/${week.id}/publish`, {
        week_start: weekStart,
        // A client always publishes to their own calendar.
        ...(isClient ? {} : { client_ids: selectedClientIds }),
      });
      const inserted = typeof payload.inserted === "number" ? payload.inserted : 0;
      const skipped = typeof payload.skipped === "number" ? payload.skipped : 0;
      setNotice(`Scheduled ${inserted} workout${inserted === 1 ? "" : "s"}. Left ${skipped} existing session${skipped === 1 ? "" : "s"} unchanged.`);
      setCheckedClients(null);
    });
  };

  const isActive = (selected?.assignedClients.length ?? 0) > 0;
  // Warn when another program is already active. Submitting after the warning
  // appears is the confirmation to add this one too.
  const overlapPrograms = conflict ?? (activePrograms.length > 0 ? activePrograms : null);

  const startProgram = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const confirmOverlap = overlapPrograms !== null;
    void run("start-program", async () => {
      const response = await fetch(`/api/me/programs/${selected.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starts_on: startsOn,
          goal_title: goalTitle.trim() || null,
          confirmOverlap,
        }),
      });
      const payload = await response.json();
      if (response.status === 409 && payload.code === "active_program_exists") {
        setConflict(Array.isArray(payload.activePrograms) ? payload.activePrograms : []);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Unable to start this program");
      setConflict(null);
      setGoalTitle("");
      setNotice("Program started. Publish a week to put its workouts on your calendar.");
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{isClient ? "My programs" : "Programs"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {isClient
            ? "A program plans phases and weeks. A workout can stand on its own. System programs are available to everyone."
            : "A program is a shared plan: phases, then the workouts for each week. A workout can stand on its own. System programs are available to everyone."}
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Programs</h2>
            <button
              type="button"
              onClick={() => openCreate("program")}
              aria-pressed={creating === "program"}
              className={createButtonClass(creating === "program")}
            >
              Create program
            </button>
            <ShowSystemToggle
              checked={showSystemPrograms}
              label="Show system programs"
              onChange={setShowSystemPrograms}
            />
            <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
              {visiblePrograms.length === 0 ? (
                <li className="text-sm text-slate-500">{data.programs.length === 0 ? "No programs yet." : "System programs are hidden."}</li>
              ) : null}
              {visiblePrograms.map((program) => (
                <li key={program.id}>
                  <button
                    type="button"
                    onClick={() => openProgram(program.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm ${program.id === selected?.id ? "bg-slate-950 font-semibold text-white" : "hover:bg-slate-100"}`}
                  >
                    <span className="block truncate">{libraryItemLabel(program.name, program.isSystem)}</span>
                    <span className={`block truncate text-xs ${program.id === selected?.id ? "text-slate-300" : "text-slate-500"}`}>
                      {program.phases.length} phases · {isClient ? (program.assignedClients.length > 0 ? "Active" : "Not started") : `${program.assignedClients.length} clients`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Workouts</h2>
            <p className="mt-1 text-xs text-slate-500">These stand on their own until you place one on a week.</p>
            <button
              type="button"
              onClick={() => openCreate("workout")}
              aria-pressed={creating === "workout"}
              className={createButtonClass(creating === "workout")}
            >
              Create workout
            </button>
            <ShowSystemToggle
              checked={showSystemWorkouts}
              label="Show system workouts"
              onChange={setShowSystemWorkouts}
            />
            <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
              {visibleWorkouts.length === 0 ? (
                <li className="text-sm text-slate-500">{data.workouts.length === 0 ? "No workouts yet." : "System workouts are hidden."}</li>
              ) : null}
              {visibleWorkouts.map((workout) => (
                <li key={workout.id}>
                  <button
                    type="button"
                    onClick={() => openWorkout(workout.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm ${workout.id === selectedWorkoutId ? "bg-slate-950 font-semibold text-white" : "hover:bg-slate-100"}`}
                  >
                    <span className="block truncate">{libraryItemLabel(workout.name, workout.isSystem)}</span>
                    <span className={`block truncate text-xs ${workout.id === selectedWorkoutId ? "text-slate-300" : "text-slate-500"}`}>
                      {workout.blocks.length === 0 ? "No blocks yet" : `${workout.blocks.length} block${workout.blocks.length === 1 ? "" : "s"}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Exercises</h2>
            <p className="mt-1 text-xs text-slate-500">These are the movements a workout can include.</p>
            <button
              type="button"
              onClick={() => openCreate("exercise")}
              aria-pressed={creating === "exercise"}
              className={createButtonClass(creating === "exercise")}
            >
              Create exercise
            </button>
            <ShowSystemToggle
              checked={showSystemExercises}
              label="Show system exercises"
              onChange={setShowSystemExercises}
            />
            <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
              {visibleExercises.length === 0 ? (
                <li className="text-sm text-slate-500">{data.exercises.length === 0 ? "No exercises yet." : "System exercises are hidden."}</li>
              ) : null}
              {visibleExercises.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => openExercise(exercise.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm ${exercise.id === selectedExerciseId ? "bg-slate-950 font-semibold text-white" : "hover:bg-slate-100"}`}
                  >
                    <span className="block truncate">{libraryItemLabel(exercise.name, exercise.isSystem)}</span>
                    <span className={`block truncate text-xs ${exercise.id === selectedExerciseId ? "text-slate-300" : "text-slate-500"}`}>
                      {exerciseSummary(exercise)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {creating === "exercise" ? (
          <div className="space-y-4">
            <ExerciseEditor
              exercise={null}
              creating
              pending={pending}
              onCreate={createExercise}
              onCancelCreate={closeCreate}
              onSave={async () => false}
              onDelete={async () => false}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
          </div>
        ) : creating === "workout" ? (
          <div className="space-y-4">
            <WorkoutEditor
              workouts={data.workouts}
              exercises={data.exercises}
              selectedWorkoutId={null}
              creating
              pending={pending}
              onDuplicate={() => undefined}
              onCreate={createWorkout}
              onCancelCreate={closeCreate}
              onSave={async () => false}
              onDelete={async () => false}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
          </div>
        ) : creating === "program" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <NewProgramForm pending={pending === "create-program"} onCreate={createProgram} onCancel={closeCreate} />
            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="mt-4 text-sm text-emerald-700">{notice}</p> : null}
          </section>
        ) : selectedExerciseId ? (
          <div className="space-y-4">
            {selectedExercise ? (
              <ExerciseEditor
                exercise={selectedExercise}
                pending={pending}
                onSave={(exerciseId, body) => run("save-exercise", async () => {
                  await patchJson(`/api/exercises/${exerciseId}`, body);
                  setNotice("Exercise saved.");
                })}
                onDelete={(exerciseId) => run("delete-exercise", async () => {
                  const response = await fetch(`/api/exercises/${exerciseId}`, { method: "DELETE" });
                  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                  if (!response.ok) throw new Error(payload?.error || "Unable to delete this exercise");
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete("exercise");
                  router.replace(`/dashboard?${params.toString()}`);
                  setNotice("Exercise deleted.");
                })}
              />
            ) : (
              <p className="text-sm text-slate-500">Opening this exercise...</p>
            )}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
          </div>
        ) : selectedWorkoutId ? (
          <div className="space-y-4">
            <WorkoutEditor
              workouts={data.workouts}
              exercises={data.exercises}
              selectedWorkoutId={selectedWorkoutId}
              pending={pending}
              onDuplicate={(workoutId) => {
                void run("duplicate-workout", async () => {
                  const payload = await postJson(`/api/workouts/${workoutId}/duplicate`, {});
                  if (typeof payload.id === "string") openWorkout(payload.id);
                  setNotice("Workout duplicated. It uses the same exercises. Sets and reps on this copy are separate.");
                });
              }}
              onSave={(workoutId, body) => run("save-workout", async () => {
                await patchJson(`/api/workouts/${workoutId}`, body);
                setNotice("Workout saved.");
              })}
              onDelete={(workoutId) => run("delete-workout", async () => {
                const response = await fetch(`/api/workouts/${workoutId}`, { method: "DELETE" });
                const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                if (!response.ok) throw new Error(payload?.error || "Unable to delete this workout");
                const params = new URLSearchParams(searchParams.toString());
                params.delete("workout");
                router.replace(`/dashboard?${params.toString()}`);
                setNotice("Workout deleted.");
              })}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
          </div>
        ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {!selected ? (
            <p className="text-sm text-slate-500">
              {selectedId
                ? "Opening this program..."
                : "Select a program to plan its phases and weeks, a workout to edit it on its own, or an exercise to edit its details."}
            </p>
          ) : (
            <div className="space-y-6">
              <form onSubmit={saveProgram} className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Program{selected.isSystem ? " · System" : ""}{selected.status === "draft" ? " · Draft copy" : ""}</p>
                  <button
                    type="button"
                    onClick={duplicateProgram}
                    disabled={pending === "duplicate-program"}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {pending === "duplicate-program" ? "Duplicating..." : "Duplicate program"}
                  </button>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-slate-600">Name</span>
                  <input required maxLength={160} disabled={!editingProgram} value={draftName} onChange={(event) => setDraftName(event.target.value)} className={fieldClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-slate-600">Description</span>
                  <textarea
                    value={draftDescription}
                    disabled={!editingProgram}
                    onChange={(event) => setDraftDescription(event.target.value)}
                    rows={2}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </label>
                {selected.isSystem ? (
                  <p className="text-sm text-slate-500">This system program is available to everyone. Duplicate it to copy the schedule. The workouts stay the same.</p>
                ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <EditSaveActions
                    editing={editingProgram}
                    dirty={programDirty}
                    pending={pending === "save-program"}
                    saveLabel="Save program"
                    onEdit={startProgramEdit}
                    onCancel={cancelProgramEdit}
                  />
                  <DeleteControl
                    key={selected.id}
                    itemLabel="program"
                    detail={`Delete ${selected.name}? Its phases and weeks will be removed. This cannot be undone.`}
                    pending={pending === "delete-program"}
                    disabled={pending !== null && pending !== "delete-program"}
                    onDelete={deleteProgram}
                  />
                </div>
                )}
              </form>

              {isClient ? (
                isActive ? (
                  <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">This program is active.</p>
                ) : (
                  <form onSubmit={startProgram} className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <h3 className="text-sm font-semibold">Start this program</h3>
                      <p className="mt-1 text-xs text-slate-500">Starting a program makes it active. Then publish its weeks to your calendar.</p>
                    </div>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-600">Starts</span>
                      <input type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className={fieldClass} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-600">Goal (optional)</span>
                      <input maxLength={160} value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} className={fieldClass} />
                    </label>
                    {overlapPrograms ? <ActiveProgramWarning programs={overlapPrograms} audience="client" /> : null}
                    <button type="submit" disabled={pending === "start-program"} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">
                      {pending === "start-program" ? "Starting..." : overlapPrograms ? "Start anyway" : "Start program"}
                    </button>
                  </form>
                )
              ) : null}

              {isClient ? null : (
                <AssignProgramForm
                  key={selected.id}
                  programName={selected.name}
                  clients={clients}
                  clientsError={clientsError}
                  assignedIds={selected.assignedClients.map((client) => client.id)}
                  pending={pending === "assign-program"}
                  onAssign={assignProgram}
                />
              )}

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Phase</h3>
                  {selected.isSystem || addingPhase ? null : (
                    <button type="button" onClick={() => setAddingPhase(true)} className="text-sm font-semibold text-slate-700">
                      Add phase
                    </button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.phases.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openProgram(selected.id, item.id)}
                      className={`rounded-full px-3 py-1.5 text-sm ${item.id === phase?.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}
                    >
                      {item.position}. {item.name}
                    </button>
                  ))}
                </div>
                {selected.isSystem ? null : addingPhase ? (
                  <AddPhaseForm pending={pending === "phase"} onCreate={createPhase} onCancel={() => setAddingPhase(false)} />
                ) : selected.phases.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Add a phase to plan its weeks.</p>
                ) : null}
              </div>

              {phase ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Week in {phase.name}</h3>
                    {selected.isSystem ? null : (
                    <button type="button" onClick={createWeek} disabled={pending === "week"} className="text-sm font-semibold text-slate-700 disabled:opacity-60">
                      {pending === "week" ? "Adding..." : "Add week"}
                    </button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {phase.weeks.length === 0 ? <p className="text-sm text-slate-500">No weeks in this phase yet.</p> : null}
                    {phase.weeks.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openProgram(selected.id, phase.id, item.id)}
                        className={`rounded-xl px-3 py-1.5 text-sm ${item.id === week?.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
                      >
                        Week {item.weekNumber}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Add a phase before planning weeks.</p>
              )}

              {week ? (
                <div>
                  <h3 className="text-sm font-semibold">Week {week.weekNumber} workouts</h3>
                  <p className="mt-1 text-xs text-slate-500">Day 1 is the start date you choose when you publish.</p>
                  {data.workouts.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">Create a workout in Workouts before placing one on a day.</p>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 7 }, (_, index) => index + 1).map((dayNumber) => {
                        const slot = week.workouts.find((item) => item.dayNumber === dayNumber && item.position === 1);
                        return (
                          <label key={dayNumber} className="block rounded-xl border border-slate-100 p-3">
                            <span className="text-xs font-semibold text-slate-500">Day {dayNumber}</span>
                            <select
                              value={dayOverrides[dayNumber] ?? slot?.workoutId ?? ""}
                              disabled={selected.isSystem || pending === `day-${dayNumber}`}
                              onChange={(event) => saveDay(dayNumber, event.target.value)}
                              className={`${fieldClass} mt-2`}
                            >
                              <option value="">Rest</option>
                              {data.workouts.map((workout) => (
                                <option key={workout.id} value={workout.id}>{libraryItemLabel(workout.name, workout.isSystem)}</option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <form onSubmit={publishWeek} className="mt-6 rounded-xl bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold">Publish this week</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {isClient ? "Puts these workouts on your calendar." : "Puts these workouts on the calendars of clients assigned to this program."}
                    </p>
                    <label className="mt-3 block text-sm">
                      <span className="font-medium text-slate-600">Week starts</span>
                      <input type="date" required value={weekStart} onChange={(event) => setWeekStart(event.target.value)} className={`${fieldClass} mt-1 max-w-xs`} />
                    </label>
                    {isClient ? (
                      !isActive ? <p className="mt-3 text-sm text-slate-500">Start this program before publishing a week.</p> : null
                    ) : (
                    <fieldset className="mt-3">
                      <legend className="text-sm font-medium text-slate-600">Clients</legend>
                      {selected.assignedClients.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">No clients are on this program yet. Assign it above before publishing.</p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {selected.assignedClients.map((client) => (
                            <li key={client.id}>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedClientIds.includes(client.id)}
                                  onChange={(event) => {
                                    const next = event.target.checked
                                      ? [...selectedClientIds, client.id]
                                      : selectedClientIds.filter((id) => id !== client.id);
                                    setCheckedClients(next);
                                  }}
                                />
                                {client.name}
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </fieldset>
                    )}
                    <button
                      type="submit"
                      disabled={pending === "publish" || (isClient ? !isActive : selectedClientIds.length === 0) || week.workouts.length === 0}
                      className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {pending === "publish" ? "Publishing..." : "Publish week"}
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          )}
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="mt-4 text-sm text-emerald-700">{notice}</p> : null}
        </section>
        )}
      </div>
    </div>
  );
}

type CreationKind = "program" | "workout" | "exercise";

function creationKind(value: string | null): CreationKind | null {
  if (value === "program" || value === "workout" || value === "exercise") return value;
  return null;
}

function ShowSystemToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function AddPhaseForm({
  pending,
  onCreate,
  onCancel,
}: {
  pending: boolean;
  onCreate: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (pending || trimmed.length === 0) return;
    onCreate(trimmed, description);
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-600">Name</span>
        <input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-600">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="Optional"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add phase"}
        </button>
      </div>
    </form>
  );
}

function AssignProgramForm({
  programName,
  clients,
  clientsError = null,
  assignedIds,
  pending,
  onAssign,
}: {
  programName: string;
  clients: AssignableClient[];
  clientsError?: string | null;
  assignedIds: string[];
  pending: boolean;
  onAssign: (input: {
    clientIds: string[];
    startsOn: string;
    goalTitle: string;
    goalType: GoalType;
    confirmOverlap: boolean;
  }) => Promise<boolean>;
}) {
  const assigned = new Set(assignedIds);
  const available = clients.filter((client) => !assigned.has(client.id));
  const [picked, setPicked] = useState<string[]>([]);
  const [startsOn, setStartsOn] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("other");
  const [confirming, setConfirming] = useState(false);
  const pickedClients = available.filter((client) => picked.includes(client.id));
  const overlapping = pickedClients.filter((client) => client.activePrograms.length > 0);

  const toggle = (clientId: string, checked: boolean) => {
    setConfirming(false);
    setPicked((current) => (checked ? [...current, clientId] : current.filter((id) => id !== clientId)));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || picked.length === 0 || startsOn.trim().length === 0) return;
    if (overlapping.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    void onAssign({
      clientIds: picked,
      startsOn,
      goalTitle,
      goalType,
      confirmOverlap: overlapping.length > 0,
    }).then((assignedOk) => {
      if (!assignedOk) return;
      setPicked([]);
      setGoalTitle("");
      setConfirming(false);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold">Assign to clients</h3>
        <p className="mt-1 text-xs text-slate-500">
          Assigns {programName} and saves a goal with it. Leave the goal title blank to use the program name.
        </p>
      </div>
      {clientsError ? (
        <p className="text-sm text-red-600">{clientsError}</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-slate-500">No clients yet. Add one from Clients.</p>
      ) : (
        <>
          <fieldset>
            <legend className="text-sm font-medium text-slate-600">Clients</legend>
            <ul className="mt-2 space-y-1">
              {clients.map((client) => {
                const already = assigned.has(client.id);
                return (
                  <li key={client.id}>
                    <label className={`flex items-center gap-2 text-sm ${already ? "text-slate-500" : ""}`}>
                      <input
                        type="checkbox"
                        checked={already || picked.includes(client.id)}
                        disabled={already || pending}
                        onChange={(event) => toggle(client.id, event.target.checked)}
                      />
                      <span>{client.name}</span>
                      {already ? <span className="text-xs">Already assigned</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {available.length === 0 ? (
            <p className="text-sm text-slate-500">Every client is already on this program.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-slate-600">Starts</span>
                  <input type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className={fieldClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-slate-600">Goal type</span>
                  <select
                    value={goalType}
                    onChange={(event) => {
                      if (isGoalType(event.target.value)) setGoalType(event.target.value);
                    }}
                    className={fieldClass}
                  >
                    {GOAL_TYPES.map((type) => (
                      <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="font-medium text-slate-600">Goal title (optional)</span>
                  <input
                    maxLength={160}
                    value={goalTitle}
                    placeholder={programName}
                    onChange={(event) => setGoalTitle(event.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>
              {confirming && overlapping.length > 0 ? (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">Active program warning</p>
                  <ul className="mt-1 space-y-1">
                    {overlapping.map((client) => (
                      <li key={client.id}>
                        {client.name} already has {client.activePrograms.map((program) => program.name).join(", ")}.
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">Assign this program as well?</p>
                </div>
              ) : null}
              <button
                type="submit"
                disabled={pending || picked.length === 0}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Assigning..." : confirming && overlapping.length > 0 ? "Assign anyway" : "Assign program"}
              </button>
            </>
          )}
        </>
      )}
    </form>
  );
}

function createButtonClass(active: boolean) {
  return `mt-4 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white ${active ? "ring-2 ring-slate-400 ring-offset-2" : ""}`;
}

function NewProgramForm({
  pending,
  onCreate,
  onCancel,
}: {
  pending: boolean;
  onCreate: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (pending || trimmed.length === 0) return;
    onCreate(trimmed, description);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Program</p>
        <p className="mt-1 text-sm text-slate-500">Enter a name and an optional description. Phases and weeks can be added after it is created.</p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-600">Name</span>
        <input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-600">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create program"}
        </button>
      </div>
    </form>
  );
}

function exerciseSummary(exercise: ExerciseOption) {
  const tracking = TRACKING_TYPE_LABELS[exercise.trackingType];
  return exercise.primaryMuscleGroup ? `${tracking} · ${MUSCLE_LABELS[exercise.primaryMuscleGroup]}` : tracking;
}

async function postJson(url: string, body: unknown) {
  return sendJson("POST", url, body);
}

async function patchJson(url: string, body: unknown) {
  return sendJson("PATCH", url, body);
}

async function sendJson(method: string, url: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload as Record<string, unknown>;
}
