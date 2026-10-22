import { ChevronLeft, ChevronRight } from "lucide-react";

import { getPageItems } from "@/lib/dashboard/workout-filters";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Disables every control, e.g. while a page is loading. */
  disabled?: boolean;
};

const BASE =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed";
const IDLE = "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white";

export function Pagination({ page, totalPages, onPageChange, disabled = false }: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = getPageItems(page, totalPages);

  return (
    <nav aria-label="Pagination">
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          <button
            type="button"
            aria-label="Go to previous page"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={`${BASE} ${IDLE}`}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>
        </li>

        {items.map((item) => {
          if (typeof item !== "number") {
            return (
              <li key={item} aria-hidden="true" className="px-1 text-sm font-semibold text-slate-400 select-none">
                …
              </li>
            );
          }
          const current = item === page;
          return (
            <li key={item}>
              <button
                type="button"
                aria-label={`Go to page ${item}`}
                aria-current={current ? "page" : undefined}
                disabled={disabled && !current}
                onClick={() => {
                  if (!current) onPageChange(item);
                }}
                className={`${BASE} tabular-nums ${current ? "bg-slate-950 text-white" : IDLE}`}
              >
                {item}
              </button>
            </li>
          );
        })}

        <li>
          <button
            type="button"
            aria-label="Go to next page"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className={`${BASE} ${IDLE}`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
