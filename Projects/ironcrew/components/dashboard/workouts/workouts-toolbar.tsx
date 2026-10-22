import { useId } from "react";

import {
  SORT_LABELS,
  SORT_ORDERS,
  STATUS_FILTERS,
  STATUS_LABELS,
  WHEN_FILTERS,
  WHEN_LABELS,
  isSortOrder,
  type FilterKey,
  type SortOrder,
  type StatusFilter,
  type WhenFilter,
  type WorkoutCounts,
  type WorkoutFilters,
} from "@/lib/dashboard/workout-filters";

type WorkoutsToolbarProps = {
  filters: WorkoutFilters;
  /** Faceted counts from the API; badges are hidden until the first response. */
  counts: WorkoutCounts | null;
  onFilterChange: <K extends FilterKey>(key: K, value: FilterValues[K]) => void;
  onSortChange: (sort: SortOrder) => void;
};

type FilterValues = { when: WhenFilter; status: StatusFilter };

type Option<T extends string> = { value: T; label: string; count: number | null };

export function WorkoutsToolbar({ filters, counts, onFilterChange, onSortChange }: WorkoutsToolbarProps) {
  const sortId = useId();

  const statusOptions: Option<StatusFilter>[] = STATUS_FILTERS.map((value) => ({
    value,
    label: STATUS_LABELS[value],
    count: counts?.status[value] ?? null,
  }));
  const whenOptions: Option<WhenFilter>[] = WHEN_FILTERS.map((value) => ({
    value,
    label: WHEN_LABELS[value],
    count: counts?.when[value] ?? null,
  }));

  return (
    <section
      aria-label="Workout filters"
      className="flex flex-col gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:flex-wrap lg:items-start"
    >
      <FilterGroup
        legend="Status"
        value={filters.status}
        options={statusOptions}
        onChange={(value) => onFilterChange("status", value)}
      />
      <FilterGroup
        legend="Date"
        value={filters.when}
        options={whenOptions}
        onChange={(value) => onFilterChange("when", value)}
      />
      <div className="lg:ml-auto">
        <label htmlFor={sortId} className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Sort by
        </label>
        <select
          id={sortId}
          value={filters.sort}
          onChange={(event) => {
            const next = event.target.value;
            if (isSortOrder(next)) onSortChange(next);
          }}
          className="h-7 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          {SORT_ORDERS.map((order) => (
            <option key={order} value={order}>
              {SORT_LABELS[order]}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function FilterGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 p-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 ${
                selected
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {option.label}
              {option.count !== null && <CountBadge count={option.count} selected={selected} />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CountBadge({ count, selected }: { count: number; selected: boolean }) {
  const tone = selected
    ? "bg-white/20 text-white"
    : count === 0
      ? "bg-slate-50 text-slate-400"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`min-w-4 rounded-full px-1 text-center text-[10px] font-semibold tabular-nums ${tone}`}>
      <span className="sr-only">(</span>
      {count}
      <span className="sr-only"> workouts)</span>
    </span>
  );
}