"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { TrainerProgramsData } from "@/lib/dashboard/load-trainer-programs";

const fieldClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400";

function activeWeekId(data: TrainerProgramsData, searchParams: { get(name: string): string | null }) {
  if (data.kind !== "ready") return null;
  const selected = data.programs.find((program) => program.id === searchParams.get("program"));
  const phase = selected?.phases.find((item) => item.id === searchParams.get("phase")) ?? selected?.phases[0];
  const week = phase?.weeks.find((item) => item.id === searchParams.get("week")) ?? phase?.weeks[0];
  return week?.id ?? null;
}

export function ProgramsPanel({ data }: { data: TrainerProgramsData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [programName, setProgramName] = useState("");
  const [phaseName, setPhaseName] = useState("");
  const [workoutName, setWorkoutName] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [checkedClients, setCheckedClients] = useState<string[] | null>(null);
  const [dayOverrides, setDayOverrides] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const selectedProgramId = data.kind === "ready"
    ? data.programs.find((program) => program.id === searchParams.get("program"))?.id ?? null
    : null;

  useEffect(() => {
    setCheckedClients(null);
  }, [selectedProgramId]);

  const selectedWeekId = activeWeekId(data, searchParams);
  useEffect(() => {
    setDayOverrides({});
  }, [selectedWeekId]);

  if (data.kind === "error") {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Programs</h1>
        <p className="mt-2 text-sm text-slate-500">{data.message}</p>
      </div>
    );
  }

  const selectedId = searchParams.get("program");
  const selected = data.programs.find((program) => program.id === selectedId) ?? null;
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
    router.replace(`/dashboard?${params.toString()}`);
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  };

  const createProgram = (event: FormEvent) => {
    event.preventDefault();
    void run("program", async () => {
      const payload = await postJson("/api/programs", { name: programName, description: null });
      setProgramName("");
      if (typeof payload.id === "string") openProgram(payload.id);
    });
  };

  const createPhase = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void run("phase", async () => {
      const payload = await postJson(`/api/programs/${selected.id}/phases`, { name: phaseName, description: null });
      setPhaseName("");
      if (typeof payload.id === "string") openProgram(selected.id, payload.id);
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
        client_ids: selectedClientIds,
      });
      const inserted = typeof payload.inserted === "number" ? payload.inserted : 0;
      const skipped = typeof payload.skipped === "number" ? payload.skipped : 0;
      setNotice(`Scheduled ${inserted} workout${inserted === 1 ? "" : "s"}. Left ${skipped} existing session${skipped === 1 ? "" : "s"} unchanged.`);
      setCheckedClients(null);
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Programs</h1>
        <p className="mt-2 text-sm text-slate-500">Build a shared plan: phase, then the workouts for each week.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Library</h2>
          <form onSubmit={createProgram} className="mt-4 space-y-2">
            <input
              value={programName}
              onChange={(event) => setProgramName(event.target.value)}
              placeholder="New program name"
              maxLength={160}
              required
              className={fieldClass}
            />
            <button type="submit" disabled={pending === "program"} className="w-full rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {pending === "program" ? "Creating..." : "Create program"}
            </button>
          </form>
          <ul className="mt-4 space-y-1">
            {data.programs.length === 0 ? <li className="text-sm text-slate-500">No programs yet.</li> : null}
            {data.programs.map((program) => (
              <li key={program.id}>
                <button
                  type="button"
                  onClick={() => openProgram(program.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${program.id === selected?.id ? "bg-slate-950 font-semibold text-white" : "hover:bg-slate-100"}`}
                >
                  <span className="block truncate">{program.name}</span>
                  <span className={`block truncate text-xs ${program.id === selected?.id ? "text-slate-300" : "text-slate-500"}`}>
                    {program.phases.length} phases · {program.assignedClients.length} clients
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {!selected ? (
            <p className="text-sm text-slate-500">
              {selectedId ? "Opening this program..." : "Select a program, or create one, to set its phases and weekly workouts."}
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Program</p>
                <h2 className="mt-1 text-2xl font-bold">{selected.name}</h2>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Phase</h3>
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
                <form onSubmit={createPhase} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={phaseName}
                    onChange={(event) => setPhaseName(event.target.value)}
                    placeholder="Phase name"
                    maxLength={160}
                    required
                    className={fieldClass}
                  />
                  <button type="submit" disabled={pending === "phase"} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-60">
                    {pending === "phase" ? "Adding..." : "Add phase"}
                  </button>
                </form>
              </div>

              {phase ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Week in {phase.name}</h3>
                    <button type="button" onClick={createWeek} disabled={pending === "week"} className="text-sm font-semibold text-slate-700 disabled:opacity-60">
                      {pending === "week" ? "Adding..." : "Add week"}
                    </button>
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
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run("workout", async () => {
                        await postJson("/api/workouts", { name: workoutName });
                        setWorkoutName("");
                      });
                    }}
                    className="mt-3 flex flex-col gap-2 sm:flex-row"
                  >
                    <input
                      value={workoutName}
                      onChange={(event) => setWorkoutName(event.target.value)}
                      placeholder="New library workout"
                      maxLength={160}
                      required
                      className={fieldClass}
                    />
                    <button type="submit" disabled={pending === "workout"} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-60">
                      {pending === "workout" ? "Adding..." : "Add workout"}
                    </button>
                  </form>
                  {data.workouts.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">Add a workout to your library before placing one on a day.</p>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 7 }, (_, index) => index + 1).map((dayNumber) => {
                        const slot = week.workouts.find((item) => item.dayNumber === dayNumber && item.position === 1);
                        return (
                          <label key={dayNumber} className="block rounded-xl border border-slate-100 p-3">
                            <span className="text-xs font-semibold text-slate-500">Day {dayNumber}</span>
                            <select
                              value={dayOverrides[dayNumber] ?? slot?.workoutId ?? ""}
                              disabled={pending === `day-${dayNumber}`}
                              onChange={(event) => saveDay(dayNumber, event.target.value)}
                              className={`${fieldClass} mt-2`}
                            >
                              <option value="">Rest</option>
                              {data.workouts.map((workout) => (
                                <option key={workout.id} value={workout.id}>{workout.name}</option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <form onSubmit={publishWeek} className="mt-6 rounded-xl bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold">Publish this week</h3>
                    <p className="mt-1 text-xs text-slate-500">Puts these workouts on the calendars of clients assigned to this program.</p>
                    <label className="mt-3 block text-sm">
                      <span className="font-medium text-slate-600">Week starts</span>
                      <input type="date" required value={weekStart} onChange={(event) => setWeekStart(event.target.value)} className={`${fieldClass} mt-1 max-w-xs`} />
                    </label>
                    <fieldset className="mt-3">
                      <legend className="text-sm font-medium text-slate-600">Clients</legend>
                      {selected.assignedClients.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">No clients are on this program yet. Assign it from a client first.</p>
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
                    <button
                      type="submit"
                      disabled={pending === "publish" || selectedClientIds.length === 0 || week.workouts.length === 0}
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
      </div>
    </div>
  );
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload as Record<string, unknown>;
}
