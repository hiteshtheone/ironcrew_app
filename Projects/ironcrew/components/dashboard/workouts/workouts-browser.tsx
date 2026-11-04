"use client";

import { useEffect, useRef, useState } from "react";

import { ActiveFilterPills } from "@/components/dashboard/workouts/active-filter-pills";
import { Pagination } from "@/components/dashboard/workouts/pagination";
import { useWorkoutFilters } from "@/components/dashboard/workouts/use-workout-filters";
import { WorkoutList, WorkoutListSkeleton } from "@/components/dashboard/workouts/workout-list";
import { WorkoutsEmptyState } from "@/components/dashboard/workouts/workouts-empty-state";
import { WorkoutsToolbar } from "@/components/dashboard/workouts/workouts-toolbar";
import { PAGE_SIZE, rangeLabel, totalPagesFor, type WorkoutPage } from "@/lib/dashboard/workout-filters";

type FetchResult = {
  /** Identifies the request this result belongs to (endpoint + query + retry token). */
  key: string;
  payload: WorkoutPage | null;
  error: string | null;
};

const LOAD_ERROR = "Couldn't load workouts";

export function WorkoutsBrowser({
  endpoint,
  emptyMessage,
}: {
  /** Path without a query string, for example `/api/me/workouts`. */
  endpoint: string;
  /** Shown when there are no workouts and no filters are active. */
  emptyMessage: string;
}) {
  const { filters, apiQuery, activeFilters, setFilter, setSort, setPage, clearFilter, clearAll } = useWorkoutFilters();
  const [result, setResult] = useState<FetchResult | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);

  const requestKey = `${endpoint}?${apiQuery}#${retryToken}`;

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`${endpoint}?${apiQuery}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (Partial<WorkoutPage> & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error || LOAD_ERROR);
        if (!body || !Array.isArray(body.workouts) || !body.counts) throw new Error(LOAD_ERROR);
        const payload = body as WorkoutPage;

        // A stale deep link can point past the last page; snap back to the last one.
        const lastPage = totalPagesFor(payload.total, payload.pageSize);
        if (payload.page > lastPage) {
          setPage(lastPage);
          return;
        }
        setResult({ key: `${endpoint}?${apiQuery}#${retryToken}`, payload, error: null });
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setResult({
          key: `${endpoint}?${apiQuery}#${retryToken}`,
          payload: null,
          error: caught instanceof Error ? caught.message : LOAD_ERROR,
        });
      });

    return () => controller.abort();
  }, [endpoint, apiQuery, retryToken, setPage]);

  const settled = result?.key === requestKey;
  const pending = !settled;
  // While a new request is in flight, keep showing the previous data (faded) instead of flashing a blank list.
  const payload = result?.payload ?? null;
  const error = settled ? result.error : null;
  const hasActiveFilters = activeFilters.length > 0;

  const changePage = (page: number) => {
    setPage(page);
    const top = resultsRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="space-y-3">
        <WorkoutsToolbar
          filters={filters}
          counts={payload?.counts ?? null}
          onFilterChange={setFilter}
          onSortChange={setSort}
        />
        <ActiveFilterPills filters={activeFilters} onRemove={clearFilter} onClearAll={clearAll} />
      </div>

      <section
        ref={resultsRef}
        aria-label="Workout results"
        aria-busy={pending}
        className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => setRetryToken((token) => token + 1)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
            >
              Try again
            </button>
          </div>
        ) : !payload ? (
          <WorkoutListSkeleton rows={PAGE_SIZE} />
        ) : (
          <div className={`transition-opacity duration-200 ${pending ? "pointer-events-none opacity-50" : "opacity-100"}`}>
            {payload.total === 0 ? (
              <WorkoutsEmptyState hasActiveFilters={hasActiveFilters} onClearAll={clearAll} emptyMessage={emptyMessage} />
            ) : (
              <WorkoutList workouts={payload.workouts} />
            )}
          </div>
        )}

        {payload && payload.total > 0 && !error && (
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" aria-live="polite" className="text-sm text-slate-500">
              {rangeLabel(payload.page, payload.pageSize, payload.total)}
            </p>
            <Pagination
              page={payload.page}
              totalPages={totalPagesFor(payload.total, payload.pageSize)}
              onPageChange={changePage}
              disabled={pending}
            />
          </div>
        )}
      </section>
    </>
  );
}
