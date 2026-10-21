"use client";

import { useEffect, useState, type ReactNode } from "react";

import { addDays, formatLongDate, type ClientDashboardData } from "@/lib/dashboard/client-week";

type ProgressReport = {
  weekStart: string;
  weekEnd: string;
  completion: {
    completed: number;
    notCompleted: number;
    cancelled: number;
    percent: number;
  };
  weeks: {
    start: string;
    label: string;
    ranKm: number;
    rodeKm: number;
    weightKg: number;
    reps: number;
  }[];
  bodyParts: {
    name: string;
    weightKg: number;
    reps: number;
    maxWeightKg: number;
  }[];
};

const RAN = "#10b981";
const RODE = "#7c3aed";
const WEIGHT = "#0f172a";
const REPS = "#d97706";

export function ClientProgress({ data }: { data: Exclude<ClientDashboardData, { kind: "error" }> }) {
  const currentWeekStart = data.kind === "ready" ? (data.days[0]?.date ?? "") : "";
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weekStart) return;
    const controller = new AbortController();
    setPending(true);
    setError(null);
    setReport(null);
    void fetch(`/api/me/progress?week=${weekStart}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (ProgressReport & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error || "Couldn't load progress");
        if (!body?.completion || !Array.isArray(body.weeks) || !Array.isArray(body.bodyParts)) {
          throw new Error("Couldn't load progress");
        }
        setReport(body);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setReport(null);
        setError(caught instanceof Error ? caught.message : "Couldn't load progress");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [weekStart]);

  const atCurrentWeek = !currentWeekStart || weekStart >= currentWeekStart;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Progress</h1>
      <p className="mt-2 text-sm text-slate-500">Weekly completion, distance, and the weight and reps you logged.</p>

      {data.kind === "unlinked" ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold">Account not linked</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            Ask your trainer to connect this login to your client record. Your progress will show up here after that.
          </p>
        </section>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={pending || !weekStart}
              onClick={() => setWeekStart((current) => addDays(current, -7))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous week
            </button>
            <p className="text-sm font-semibold text-slate-800">
              {weekStart ? `Week of ${formatLongDate(weekStart)}` : "This week"}
              {pending ? " · Loading…" : ""}
            </p>
            <button
              type="button"
              disabled={pending || atCurrentWeek}
              onClick={() => setWeekStart((current) => addDays(current, 7))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next week
            </button>
          </div>

          {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

          {report && (
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
              <WeekPie completion={report.completion} />
              <ChartCard title="Distance" detail="Kilometres ran or rode across the 12 weeks ending this week">
                <GroupedColumns
                  points={report.weeks.map((week) => ({ id: week.start, label: week.label, values: [week.ranKm, week.rodeKm] }))}
                  series={[
                    { label: "Ran (km)", color: RAN },
                    { label: "Rode (km)", color: RODE },
                  ]}
                  empty="Nothing logged in these weeks."
                />
              </ChartCard>
              <ChartCard title="Weight and reps" detail="Total load and repetitions for each of those weeks">
                <GroupedColumns
                  points={report.weeks.map((week) => ({ id: week.start, label: week.label, values: [week.weightKg, week.reps] }))}
                  series={[
                    { label: "Weight (kg)", color: WEIGHT },
                    { label: "Reps", color: REPS },
                  ]}
                  empty="Nothing logged in these weeks."
                />
              </ChartCard>
              <ChartCard title="By body part" detail="Weight and reps logged in the selected week">
                <BodyPartTotals parts={report.bodyParts} />
              </ChartCard>
              <ChartCard title="Max weight" detail="Heaviest single set for each body part this week">
                <BodyPartMax parts={report.bodyParts} />
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WeekPie({
  completion,
}: {
  completion: ProgressReport["completion"];
}) {
  const active = completion.completed + completion.notCompleted;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const completedLength = active > 0 ? (completion.completed / active) * circumference : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:row-span-2">
      <h2 className="text-lg font-bold">Week status</h2>
      <p className="mt-1 text-sm text-slate-500">Percent of assigned workouts completed</p>
      {active === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No workouts assigned this week.</p>
      ) : (
        <div className="mt-6 flex flex-col items-center">
          <svg viewBox="0 0 120 120" className="size-44" role="img" aria-label={`${completion.percent} percent completed`}>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="16" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={RAN}
              strokeWidth="16"
              strokeDasharray={`${completedLength} ${circumference}`}
              transform="rotate(-90 60 60)"
            />
            <text x="60" y="64" textAnchor="middle" fontSize="18" fontWeight="700" fill="#020617">
              {completion.percent}%
            </text>
          </svg>
          <ul className="mt-4 w-full space-y-2 text-sm">
            <LegendItem color={RAN} label="Completed" value={String(completion.completed)} />
            <LegendItem color="#e2e8f0" label="Not completed" value={String(completion.notCompleted)} />
          </ul>
        </div>
      )}
      {completion.cancelled > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          {completion.cancelled} cancelled {completion.cancelled === 1 ? "workout is" : "workouts are"} not included in the percent.
        </p>
      )}
    </section>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-600">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold text-slate-900">{value}</span>
    </li>
  );
}

function ChartCard({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
      {children}
    </section>
  );
}

function GroupedColumns({
  points,
  series,
  empty,
}: {
  points: { id: string; label: string; values: number[] }[];
  series: { label: string; color: string }[];
  empty: string;
}) {
  const maxes = series.map((_, index) => Math.max(...points.map((point) => point.values[index] ?? 0), 0));
  if (maxes.every((max) => max <= 0)) return <p className="mt-4 text-sm text-slate-500">{empty}</p>;

  return (
    <div className="mt-5 overflow-x-auto">
      <div className="flex h-52 min-w-[720px] items-end gap-2">
        {points.map((point) => (
          <div key={point.id} className="flex min-w-14 flex-1 flex-col items-center">
            <div className="flex h-40 items-end gap-1">
              {point.values.map((value, index) => {
                const max = maxes[index] || 1;
                const height = value <= 0 ? 0 : Math.max(4, (value / max) * 128);
                return (
                  <div key={series[index].label} className="flex w-7 flex-col items-center justify-end">
                    <span className="mb-1 text-[10px] font-medium leading-none text-slate-500">{formatAmount(value)}</span>
                    <div className="w-3 rounded-t" style={{ height, background: series[index].color }} />
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-500">{point.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        {series.map((item) => (
          <span key={item.label} className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className="size-2.5 rounded-full" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BodyPartTotals({ parts }: { parts: ProgressReport["bodyParts"] }) {
  const logged = parts.filter((part) => part.weightKg > 0 || part.reps > 0);
  if (logged.length === 0) return <p className="mt-4 text-sm text-slate-500">Nothing logged this week.</p>;
  const maxWeight = Math.max(...logged.map((part) => part.weightKg));
  const maxReps = Math.max(...logged.map((part) => part.reps));

  return (
    <ul className="mt-5 space-y-4">
      {logged.map((part) => (
        <li key={part.name}>
          <p className="text-sm font-semibold">{part.name}</p>
          <Meter className="mt-2" label="Weight" value={part.weightKg} max={maxWeight} color={WEIGHT} suffix="kg" />
          <Meter className="mt-2" label="Reps" value={part.reps} max={maxReps} color={REPS} suffix="" />
        </li>
      ))}
    </ul>
  );
}

function BodyPartMax({ parts }: { parts: ProgressReport["bodyParts"] }) {
  const logged = parts.filter((part) => part.maxWeightKg > 0);
  if (logged.length === 0) return <p className="mt-4 text-sm text-slate-500">Nothing logged this week.</p>;
  const max = Math.max(...logged.map((part) => part.maxWeightKg));
  const ordered = [...logged].sort((left, right) => right.maxWeightKg - left.maxWeightKg || left.name.localeCompare(right.name));

  return (
    <ul className="mt-5 space-y-3">
      {ordered.map((part) => (
        <li key={part.name}>
          <Meter label={part.name} value={part.maxWeightKg} max={max} color={WEIGHT} suffix="kg" />
        </li>
      ))}
    </ul>
  );
}

function Meter({
  label,
  value,
  max,
  color,
  suffix,
  className = "",
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix: string;
  className?: string;
}) {
  const width = max > 0 && value > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">
          {formatAmount(value)}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}

function formatAmount(value: number) {
  return Number(value.toFixed(2)).toString();
}
