"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { libraryItemLabel, type ExerciseOption } from "@/lib/dashboard/load-trainer-programs";
import { defaultLiveWorkoutName } from "@/lib/dashboard/live-workout";

export function StartWorkout({
  date,
  onStarted,
}: {
  date: string;
  onStarted: (assignmentId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => defaultLiveWorkoutName(date));
  const [namedFor, setNamedFor] = useState(date);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (date !== namedFor) {
    setNamedFor(date);
    setName(defaultLiveWorkoutName(date));
  }

  const start = () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    void fetch("/api/me/workouts/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, scheduled_for: date }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string; id?: string } | null;
        if (!response.ok || !payload?.id) throw new Error(payload?.error || "Couldn't start this workout");
        setOpen(false);
        onStarted(payload.id);
        router.refresh();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Couldn't start this workout");
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
      >
        Start new workout
      </button>
      {open ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <label className="block min-w-0 flex-1 text-sm font-medium text-slate-700">
            Workout name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
          <button
            type="submit"
            disabled={pending || name.trim().length === 0}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Starting..." : "Start"}
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function AddExercise({
  assignmentId,
  exercises,
  onAdded,
}: {
  assignmentId: string;
  exercises: ExerciseOption[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const matches = exercises
    .filter((exercise) => exercise.name.toLowerCase().includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name));

  const add = (exerciseId: string) => {
    if (pendingId) return;
    setPendingId(exerciseId);
    setError(null);
    void fetch(`/api/workout-assignments/${assignmentId}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise_id: exerciseId }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Couldn't add that exercise");
        setQuery("");
        setOpen(false);
        onAdded();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Couldn't add that exercise");
      })
      .finally(() => {
        setPendingId(null);
      });
  };

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
      >
        Add exercise
      </button>
      {open ? (
        <div className="mt-3">
          <label className="block text-sm font-medium text-slate-700">
            Search exercises
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bench press"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
          {matches.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              {exercises.length === 0
                ? "No exercises in your library yet. Add one under My programs first."
                : "No exercises match that search."}
            </p>
          ) : (
            <ul className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {matches.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    disabled={pendingId !== null}
                    onClick={() => add(exercise.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                  >
                    <span>{libraryItemLabel(exercise.name, exercise.isSystem)}</span>
                    {pendingId === exercise.id ? <span className="shrink-0 text-xs text-slate-500">Adding...</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
