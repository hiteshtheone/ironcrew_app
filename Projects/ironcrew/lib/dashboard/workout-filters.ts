import { addDays } from "@/lib/dashboard/client-week";

/* -------------------------------------------------------------------------- */
/* Types & constants                                                          */
/* -------------------------------------------------------------------------- */

export const PAGE_SIZE = 10;

export const WHEN_FILTERS = ["all", "past", "present", "future", "this_week", "last_week", "next_week"] as const;
export const STATUS_FILTERS = ["all", "finished", "unfinished", "cancelled"] as const;
export const SORT_ORDERS = ["date_desc", "date_asc"] as const;

export type WhenFilter = (typeof WHEN_FILTERS)[number];
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export type WorkoutFilters = {
  when: WhenFilter;
  status: StatusFilter;
  sort: SortOrder;
  page: number;
};

export type FilterKey = "when" | "status";

export type WorkoutCounts = {
  status: Record<StatusFilter, number>;
  when: Record<WhenFilter, number>;
};

export type WorkoutRow = {
  id: string;
  name: string;
  scheduledFor: string;
  status: string;
  durationMinutes: number | null;
};

export type WorkoutPage = {
  workouts: WorkoutRow[];
  page: number;
  pageSize: number;
  total: number;
  counts: WorkoutCounts;
};

export const DEFAULT_FILTERS: WorkoutFilters = {
  when: "all",
  status: "all",
  sort: "date_desc",
  page: 1,
};

export const WHEN_LABELS: Record<WhenFilter, string> = {
  all: "All dates",
  past: "Past",
  present: "Today",
  future: "Future",
  this_week: "This week",
  last_week: "Last week",
  next_week: "Next week",
};

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  finished: "Finished",
  unfinished: "Unfinished",
  cancelled: "Cancelled",
};

export const SORT_LABELS: Record<SortOrder, string> = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
};

/** Database assignment statuses covered by each status filter. */
export const STATUS_GROUPS: Record<StatusFilter, readonly string[]> = {
  finished: ["completed"],
  unfinished: ["scheduled", "in_progress", "skipped"],
  cancelled: ["cancelled"],
  all: ["completed", "scheduled", "in_progress", "skipped", "cancelled"],
};

/* -------------------------------------------------------------------------- */
/* Type guards & URL parsing                                                  */
/* -------------------------------------------------------------------------- */

export function isWhenFilter(value: string | null | undefined): value is WhenFilter {
  return (WHEN_FILTERS as readonly string[]).includes(value ?? "");
}

export function isStatusFilter(value: string | null | undefined): value is StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "");
}

export function isSortOrder(value: string | null | undefined): value is SortOrder {
  return (SORT_ORDERS as readonly string[]).includes(value ?? "");
}

/** Returns a whole number >= 1, or null when the value is present but invalid. */
export function parsePage(value: string | null | undefined): number | null {
  if (value == null || value === "") return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : null;
}

type ParamReader = Pick<URLSearchParams, "get">;

/** Lenient parser for the UI: unknown or malformed values fall back to defaults. */
export function parseFilters(params: ParamReader): WorkoutFilters {
  const when = params.get("when");
  const status = params.get("status");
  const sort = params.get("sort");
  return {
    when: isWhenFilter(when) ? when : DEFAULT_FILTERS.when,
    status: isStatusFilter(status) ? status : DEFAULT_FILTERS.status,
    sort: isSortOrder(sort) ? sort : DEFAULT_FILTERS.sort,
    page: parsePage(params.get("page")) ?? DEFAULT_FILTERS.page,
  };
}

const WORKOUT_PARAM_KEYS = ["when", "status", "sort", "page"] as const;

/**
 * Serialises filters into query params. Default values are omitted so URLs stay
 * short; any unrelated params in `base` (e.g. `section`) are preserved.
 */
export function buildQuery(filters: WorkoutFilters, base?: URLSearchParams | string): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of WORKOUT_PARAM_KEYS) params.delete(key);
  if (filters.when !== DEFAULT_FILTERS.when) params.set("when", filters.when);
  if (filters.status !== DEFAULT_FILTERS.status) params.set("status", filters.status);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

/** Removes every workout-specific param, keeping the rest of the query string. */
export function stripWorkoutParams(base: URLSearchParams | string): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of WORKOUT_PARAM_KEYS) params.delete(key);
  return params;
}

/* -------------------------------------------------------------------------- */
/* Active filters (pills)                                                     */
/* -------------------------------------------------------------------------- */

export type ActiveFilter = {
  key: FilterKey;
  groupLabel: string;
  valueLabel: string;
};

export function getActiveFilters(filters: WorkoutFilters): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (filters.status !== DEFAULT_FILTERS.status) {
    active.push({ key: "status", groupLabel: "Status", valueLabel: STATUS_LABELS[filters.status] });
  }
  if (filters.when !== DEFAULT_FILTERS.when) {
    active.push({ key: "when", groupLabel: "Date", valueLabel: WHEN_LABELS[filters.when] });
  }
  return active;
}

/* -------------------------------------------------------------------------- */
/* Date ranges & counts (shared by the API route)                             */
/* -------------------------------------------------------------------------- */

export type DateBounds = {
  today: string;
  weekStart: string;
  weekEnd: string;
};

/** Inclusive YYYY-MM-DD range. A missing side is unbounded. */
export type DateRange = { gte?: string; lte?: string };

export function whenRange(when: WhenFilter, bounds: DateBounds): DateRange {
  switch (when) {
    case "past":
      return { lte: addDays(bounds.today, -1) };
    case "present":
      return { gte: bounds.today, lte: bounds.today };
    case "future":
      return { gte: addDays(bounds.today, 1) };
    case "this_week":
      return { gte: bounds.weekStart, lte: bounds.weekEnd };
    case "last_week":
      return { gte: addDays(bounds.weekStart, -7), lte: addDays(bounds.weekStart, -1) };
    case "next_week":
      return { gte: addDays(bounds.weekEnd, 1), lte: addDays(bounds.weekEnd, 7) };
    default:
      return {};
  }
}

export function inRange(date: string, range: DateRange): boolean {
  if (range.gte && date < range.gte) return false;
  if (range.lte && date > range.lte) return false;
  return true;
}

type FacetRow = { scheduledFor: string; status: string };

/**
 * Faceted counts: status counts honour the active date filter and date counts
 * honour the active status filter, so every badge predicts the result size.
 */
export function computeCounts(
  rows: readonly FacetRow[],
  filters: Pick<WorkoutFilters, "when" | "status">,
  bounds: DateBounds,
): WorkoutCounts {
  const activeRange = whenRange(filters.when, bounds);
  const activeStatuses = STATUS_GROUPS[filters.status];

  const status = {} as Record<StatusFilter, number>;
  for (const option of STATUS_FILTERS) {
    const statuses = STATUS_GROUPS[option];
    status[option] = rows.filter((row) => statuses.includes(row.status) && inRange(row.scheduledFor, activeRange)).length;
  }

  const when = {} as Record<WhenFilter, number>;
  for (const option of WHEN_FILTERS) {
    const range = whenRange(option, bounds);
    when[option] = rows.filter((row) => activeStatuses.includes(row.status) && inRange(row.scheduledFor, range)).length;
  }

  return { status, when };
}

export function emptyCounts(): WorkoutCounts {
  return {
    status: { all: 0, finished: 0, unfinished: 0, cancelled: 0 },
    when: { all: 0, past: 0, present: 0, future: 0, this_week: 0, last_week: 0, next_week: 0 },
  };
}

/* -------------------------------------------------------------------------- */
/* Pagination helpers                                                         */
/* -------------------------------------------------------------------------- */

export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/**
 * Builds a compact page list with a stable width, e.g.
 * `1 … 4 [5] 6 … 20`, `1 2 3 4 5 … 20` or `1 … 16 17 18 19 20`.
 */
export function getPageItems(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const page = Math.min(Math.max(current, 1), totalPages);
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  if (page >= totalPages - 3) {
    return [1, "ellipsis-start", ...Array.from({ length: 5 }, (_, index) => totalPages - 4 + index)];
  }
  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", totalPages];
}

export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return "No results";
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `Showing ${from}–${to} of ${total} ${total === 1 ? "result" : "results"}`;
}
