"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  DEFAULT_FILTERS,
  buildQuery,
  getActiveFilters,
  parseFilters,
  type ActiveFilter,
  type FilterKey,
  type SortOrder,
  type StatusFilter,
  type WhenFilter,
  type WorkoutFilters,
} from "@/lib/dashboard/workout-filters";

type FilterValues = { when: WhenFilter; status: StatusFilter };

export type UseWorkoutFilters = {
  filters: WorkoutFilters;
  /** Serialised filters, ready to append to the API URL. Stable across renders. */
  apiQuery: string;
  activeFilters: ActiveFilter[];
  setFilter: <K extends FilterKey>(key: K, value: FilterValues[K]) => void;
  setSort: (sort: SortOrder) => void;
  setPage: (page: number) => void;
  clearFilter: (key: FilterKey) => void;
  clearAll: () => void;
};

/**
 * Single source of truth for the workouts view: filters, sort and page live in
 * the URL. Every filter or sort change resets the page to 1.
 *
 * Writes use `history.replaceState`, which Next.js syncs with `useSearchParams`.
 * That avoids a server round trip for the dashboard on every click and keeps
 * the browser history free of one entry per filter tweak.
 */
export function useWorkoutFilters(): UseWorkoutFilters {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const filters = useMemo(() => parseFilters(new URLSearchParams(search)), [search]);
  const apiQuery = useMemo(() => buildQuery(filters).toString(), [filters]);
  const activeFilters = useMemo(() => getActiveFilters(filters), [filters]);

  const update = useCallback(
    (change: (current: WorkoutFilters) => WorkoutFilters) => {
      // Read from the live location so rapid consecutive updates never use stale state.
      const live = new URLSearchParams(window.location.search);
      const next = change(parseFilters(live));
      const query = buildQuery(next, live).toString();
      window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    },
    [pathname],
  );

  const setFilter = useCallback<UseWorkoutFilters["setFilter"]>(
    (key, value) => update((current) => ({ ...current, [key]: value, page: 1 })),
    [update],
  );

  const setSort = useCallback((sort: SortOrder) => update((current) => ({ ...current, sort, page: 1 })), [update]);

  const setPage = useCallback(
    (page: number) => update((current) => ({ ...current, page: Math.max(1, Math.floor(page)) })),
    [update],
  );

  const clearFilter = useCallback(
    (key: FilterKey) => update((current) => ({ ...current, [key]: DEFAULT_FILTERS[key], page: 1 })),
    [update],
  );

  // Clears filters only; the chosen sort order is a view preference and is kept.
  const clearAll = useCallback(
    () => update((current) => ({ ...DEFAULT_FILTERS, sort: current.sort })),
    [update],
  );

  return { filters, apiQuery, activeFilters, setFilter, setSort, setPage, clearFilter, clearAll };
}
