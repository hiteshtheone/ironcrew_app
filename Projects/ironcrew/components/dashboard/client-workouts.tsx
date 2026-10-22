"use client";

import { useEffect, useState } from "react";

import {
  formatLongDate,
  isAssignmentStatus,
  statusLabel,
  type ClientDashboardData,
} from "@/lib/dashboard/client-week";

type When = "past" | "present" | "future" | "all";
type Completion = "finished" | "unfinished" | "cancelled" | "all";

type WorkoutRow = {
  id: string;
  name: string;
  scheduledFor: string;
  status: string;
  durationMinutes: number | null;
};

type WorkoutPage = {
  workouts: WorkoutRow[];
  page: number;
  pageSize: number;
  total: number;
};

const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "past", label: "Past" },
  { value: "present", label: "Today" },
  { value: "future", label: "Future" },
  { value: "all", label: "All" },
];

const STATUS_OPTIONS: { value: Completion; label: string }[] = [
  { value: "finished", label: "Finished" },
  { value: "unfinished", label: "Unfinished" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export function ClientWorkouts({ data }: { data: Exclude<ClientDashboardData, { kind: "error" }> }) {
  const [when, setWhen] = useState<When>("all");
  const [status, setStatus] = useState<Completion>("all");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<WorkoutPage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data.kind !== "ready") return;
    const controller = new AbortController();
    setPending(true);
    setError(null);
    setPayload(null);

    const params = new URLSearchParams({ when, status, page: String(page) });
    void fetch(`/api/me/workouts?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (WorkoutPage & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error || "Couldn't load workouts");
        if (!body || !Array.isArray(body.workouts)) throw new Error("Couldn't load workouts");
        const lastPage = Math.max(1, Math.ceil(body.total / body.pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setPayload(body);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setPayload(null);
        setError(caught instanceof Error ? caught.message : "Couldn't load workouts");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });

    return () => controller.abort();
  }, [data.kind, when, status, page]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Workouts</h1>
      <p className="mt-2 text-sm text-slate-500">Finished, unfinished, and cancelled sessions before today, today, and later.</p>

      {data.kind === "unlinked" ? (
        <UnlinkedAccount />
      ) : (
        <>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
            <Choice
              label="When"
              value={when}
              options={WHEN_OPTIONS}
              onChange={(next) => {
                setWhen(next);
                setPage(1);
              }}
            />
            <Choice
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
            />
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {pending && !payload && <p className="text-sm text-slate-500">Loading workouts…</p>}
            {payload && payload.workouts.length === 0 && !error && (
              <p className="text-sm text-slate-500">{emptyMessage(when, status)}</p>
            )}
            {payload && payload.workouts.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {payload.workouts.map((workout) => (
                  <li key={workout.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-base font-semibold">{workout.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatLongDate(workout.scheduledFor)}
                        {workout.durationMinutes ? ` · ${workout.durationMinutes} min` : ""}
                      </p>
                    </div>
                    <StatusPill status={workout.status} />
                  </li>
                ))}
              </ul>
            )}

            {payload && payload.total > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">{rangeLabel(payload)}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending || page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={pending || page * payload.pageSize >= payload.total}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${selected ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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

function emptyMessage(when: When, status: Completion) {
  const statusText = status === "finished" ? "finished" : status === "unfinished" ? "unfinished" : status === "cancelled" ? "cancelled" : "all";
  const whenText = when === "past" ? "before today" : when === "present" ? "today" : when ==="future" ? "after today": "all" ;
  return `No ${statusText} workouts ${whenText}.`;
}

function rangeLabel(payload: WorkoutPage) {
  const from = (payload.page - 1) * payload.pageSize + 1;
  const to = Math.min(payload.page * payload.pageSize, payload.total);
  return `Showing ${from}–${to} of ${payload.total}`;
}

function UnlinkedAccount() {
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-bold">Account not linked</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-500">
        Ask your trainer to connect this login to your client record. Your workouts will show up here after that.
      </p>
    </section>
  );
}
