import { addDays, formatWeekday } from "@/lib/dashboard/client-week";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type MonthDay = {
  date: string;
  inMonth: boolean;
};

export type MonthView = {
  /** First day of the displayed month, YYYY-MM-01. */
  monthStart: string;
  label: string;
  days: MonthDay[];
  /** First visible cell, including the leading days from the previous month. */
  from: string;
  /** Last visible cell, including the trailing days from the next month. */
  to: string;
};

/** Monday of the week that contains `ymd`. Weeks match the training week. */
function weekStart(ymd: string) {
  const index = WEEKDAY_INDEX[formatWeekday(ymd)] ?? 0;
  const mondayOffset = index === 0 ? -6 : 1 - index;
  return addDays(ymd, mondayOffset);
}

export function formatMonthLabel(ymd: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${ymd.slice(0, 7)}-01T12:00:00Z`));
}

/** Move a month start by `delta` months. `monthStart` is any day in the source month. */
export function shiftMonth(monthStart: string, delta: number) {
  const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}-01`;
}

/**
 * The month grid for the month that contains `anchor`.
 * Cells start on Monday and run through the Sunday of the last week.
 */
export function monthView(anchor: string): MonthView {
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const [year, month] = monthStart.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const days: MonthDay[] = [];
  let cursor = weekStart(monthStart);

  for (;;) {
    days.push({ date: cursor, inMonth: cursor.slice(0, 7) === monthStart.slice(0, 7) });
    if (cursor >= monthEnd && days.length % 7 === 0) break;
    cursor = addDays(cursor, 1);
  }

  return {
    monthStart,
    label: formatMonthLabel(monthStart),
    days,
    from: days[0].date,
    to: days[days.length - 1].date,
  };
}

/** Keep every workout on its day. Statuses are not collapsed. */
export function groupByDate<T extends { scheduledFor: string }>(workouts: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const workout of workouts) {
    const existing = grouped.get(workout.scheduledFor);
    if (existing) existing.push(workout);
    else grouped.set(workout.scheduledFor, [workout]);
  }
  return grouped;
}
