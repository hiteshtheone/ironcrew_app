"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { WorkoutAssignmentDetail } from "@/components/dashboard/workout-assignment-detail";
import {
  formatDayNumber,
  formatLongDate,
  isAssignmentStatus,
  statusLabel,
  type AssignmentStatus,
} from "@/lib/dashboard/client-week";
import { groupByDate, monthView, shiftMonth } from "@/lib/dashboard/calendar-month";
import type { CalendarEntry } from "@/lib/dashboard/load-calendar";

const DOT_CLASS: Record<AssignmentStatus, string> = {
  scheduled: "bg-slate-400",
  in_progress: "bg-violet-500",
  completed: "bg-emerald-500",
  skipped: "bg-amber-500",
  cancelled: "bg-rose-400",
};

const VISIBLE_DOTS = 3;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthCalendar({
  today,
  endpoint,
  showClientName = false,
  enabled = true,
}: {
  today: string;
  endpoint: string;
  /** Trainers see which client a workout belongs to. */
  showClientName?: boolean;
  /** Unlinked clients still see the month, with no request. */
  enabled?: boolean;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => monthView(today).monthStart);
  const [selectedDate, setSelectedDate] = useState(today);
  const [workouts, setWorkouts] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openForDate, setOpenForDate] = useState(selectedDate);

  const view = monthView(visibleMonth);
  const byDate = groupByDate(workouts);

  if (openForDate !== selectedDate) {
    setOpenForDate(selectedDate);
    setOpenId(null);
  }

  useEffect(() => {
    if (!enabled) {
      setWorkouts([]);
      setLoading(false);
      setError(null);
      return;
    }

    const range = monthView(visibleMonth);
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${endpoint}?from=${range.from}&to=${range.to}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string; workouts?: unknown } | null;
        if (!response.ok) throw new Error(payload?.error || "Couldn't load this month");
        return normalizeWorkouts(payload?.workouts);
      })
      .then((next) => {
        if (cancelled) return;
        setWorkouts(next);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setWorkouts([]);
        setError(caught instanceof Error ? caught.message : "Couldn't load this month");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, endpoint, visibleMonth]);

  const changeMonth = (delta: number) => {
    const next = shiftMonth(visibleMonth, delta);
    setVisibleMonth(next);
    setSelectedDate(next.slice(0, 7) === today.slice(0, 7) ? today : next);
  };

  const goToToday = () => {
    setVisibleMonth(monthView(today).monthStart);
    setSelectedDate(today);
  };

  const selectedWorkouts = [...(byDate.get(selectedDate) ?? [])].sort((left, right) => {
    if (showClientName) {
      const byClient = (left.clientName ?? "").localeCompare(right.clientName ?? "");
      if (byClient !== 0) return byClient;
    }
    return left.name.localeCompare(right.name);
  });

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Calendar</h1>
      <p className="mt-2 text-sm text-slate-500">
        {enabled ? "Each dot is a workout, colored by its status." : "This login is not connected to a client profile yet."}
      </p>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <h2 className="min-w-40 text-center text-lg font-bold">{view.label}</h2>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToToday}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
          >
            Today
          </button>
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {(Object.keys(DOT_CLASS) as AssignmentStatus[]).map((status) => (
            <li key={status} className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className={`size-2 rounded-full ${DOT_CLASS[status]}`} />
              {statusLabel(status)}
            </li>
          ))}
        </ul>

        <div className="mt-5 grid grid-cols-7 gap-1 sm:gap-2">
          {WEEKDAYS.map((weekday) => (
            <p key={weekday} className="px-1 text-center text-[11px] font-semibold text-slate-400 sm:text-xs">
              {weekday}
            </p>
          ))}
          {view.days.map((day) => {
            const dayWorkouts = byDate.get(day.date) ?? [];
            const selected = day.date === selectedDate;
            const isToday = day.date === today;
            const tone = selected
              ? "border-slate-950 bg-slate-950 text-white"
              : isToday
                ? "border-slate-950 bg-white ring-2 ring-slate-950"
                : day.inMonth
                  ? "border-slate-100 bg-slate-50 text-slate-950"
                  : "border-transparent bg-transparent text-slate-400";
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                aria-pressed={selected}
                aria-current={isToday ? "date" : undefined}
                aria-label={dayLabel(day.date, dayWorkouts.length)}
                className={`min-h-16 overflow-hidden rounded-xl border p-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950 sm:min-h-[4.75rem] sm:p-2 ${tone}`}
              >
                <span className={`text-xs font-semibold sm:text-sm ${isToday && !selected ? "text-slate-950" : ""}`}>
                  {formatDayNumber(day.date)}
                </span>
                <span className="mt-2 flex items-center gap-1">
                  {dayWorkouts.slice(0, VISIBLE_DOTS).map((workout) => (
                    <span
                      key={workout.id}
                      className={`size-1.5 shrink-0 rounded-full ${selected ? "ring-1 ring-white/70" : ""} ${DOT_CLASS[workout.status]}`}
                    />
                  ))}
                  {dayWorkouts.length > VISIBLE_DOTS ? (
                    <span className={`text-[10px] font-semibold ${selected ? "text-slate-300" : "text-slate-500"}`}>
                      +{dayWorkouts.length - VISIBLE_DOTS}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {loading ? <p className="mt-4 text-sm text-slate-500">Loading this month...</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold">{formatLongDate(selectedDate)}</h2>
        {selectedWorkouts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Nothing is scheduled for this day.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {selectedWorkouts.map((workout) => {
              const open = openId === workout.id;
              return (
                <li key={workout.id} className="py-4 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : workout.id)}
                    className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-2">
                      <ChevronRight className={`mt-0.5 size-4 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`} />
                      <span className="min-w-0">
                        <span className="block text-base font-semibold">{workout.name}</span>
                        {showClientName && workout.clientName ? (
                          <span className="mt-1 block text-xs text-slate-500">{workout.clientName}</span>
                        ) : null}
                      </span>
                    </span>
                    <StatusPill status={workout.status} />
                  </button>
                  {open ? (
                    <WorkoutAssignmentDetail assignmentId={workout.id} mode={showClientName ? "trainer" : "client"} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: AssignmentStatus }) {
  const tone =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "in_progress"
        ? "bg-violet-50 text-violet-700"
        : status === "skipped"
          ? "bg-amber-50 text-amber-700"
          : status === "cancelled"
            ? "bg-rose-50 text-rose-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{statusLabel(status)}</span>;
}

function dayLabel(date: string, count: number) {
  if (count === 0) return `${formatLongDate(date)}, no workouts`;
  return `${formatLongDate(date)}, ${count} ${count === 1 ? "workout" : "workouts"}`;
}

function normalizeWorkouts(value: unknown): CalendarEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const id = typeof record?.id === "string" ? record.id : null;
    const name = typeof record?.name === "string" ? record.name : null;
    const scheduledFor = typeof record?.scheduledFor === "string" ? record.scheduledFor : null;
    const status = typeof record?.status === "string" ? record.status : null;
    if (!record || !id || !name || !scheduledFor || !status || !isAssignmentStatus(status)) return [];
    const duration = record.durationMinutes;
    return [
      {
        id,
        name,
        scheduledFor,
        status,
        durationMinutes: typeof duration === "number" && duration > 0 ? duration : null,
        programName: typeof record.programName === "string" ? record.programName : null,
        givenBy: typeof record.givenBy === "string" ? record.givenBy : "Trainer",
        clientName: typeof record.clientName === "string" ? record.clientName : null,
      },
    ];
  });
}
