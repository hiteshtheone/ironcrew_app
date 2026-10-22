import { X } from "lucide-react";

import type { ActiveFilter, FilterKey } from "@/lib/dashboard/workout-filters";

type ActiveFilterPillsProps = {
  filters: ActiveFilter[];
  onRemove: (key: FilterKey) => void;
  onClearAll: () => void;
};

export function ActiveFilterPills({ filters, onRemove, onClearAll }: ActiveFilterPillsProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Active filters</span>
      <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1.5">
        {filters.map((filter) => (
          <li key={filter.key}>
            <span className="inline-flex h-6 items-center gap-0.5 rounded-full bg-violet-50 pl-2.5 pr-0.5 text-xs font-semibold text-violet-700">
              <span>
                <span className="font-medium text-violet-500">{filter.groupLabel}:</span> {filter.valueLabel}
              </span>
              <button
                type="button"
                onClick={() => onRemove(filter.key)}
                aria-label={`Remove filter: ${filter.groupLabel} ${filter.valueLabel}`}
                className="grid size-5 place-items-center rounded-full hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClearAll}
        className="rounded-full px-1.5 py-0.5 text-xs font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-950"
      >
        Clear all
      </button>
    </div>
  );
}
