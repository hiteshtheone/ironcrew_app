import { SearchX } from "lucide-react";

type WorkoutsEmptyStateProps = {
  hasActiveFilters: boolean;
  onClearAll: () => void;
};

export function WorkoutsEmptyState({ hasActiveFilters, onClearAll }: WorkoutsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <SearchX aria-hidden="true" className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{hasActiveFilters ? "No results found" : "No workouts yet"}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {hasActiveFilters
          ? "No workouts match your current filters. Try removing a filter to see more."
          : "Workouts your trainer assigns to you will show up here."}
      </p>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
