"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, ChevronRight, Circle, X } from "lucide-react";

import { checklistProgress, type ChecklistItem } from "@/lib/onboarding/checklist";

export function GetStartedChecklist({ items }: { items: ChecklistItem[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = checklistProgress(items);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    setError(null);
    void fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist_dismissed: true }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Couldn't hide the checklist");
        }
        router.refresh();
      })
      .catch((caught: unknown) => {
        setHidden(false);
        setError(caught instanceof Error ? caught.message : "Couldn't hide the checklist");
      });
  };

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Get started">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Get started</h2>
          <p className="mt-1 text-sm text-slate-500">
            {progress.done} of {progress.total} done
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Hide checklist"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress.percent}%` }} />
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id}>
            {item.done ? (
              <div className="flex items-center gap-3 py-3">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
                <span className="text-sm font-medium text-slate-400 line-through">{item.label}</span>
              </div>
            ) : (
              <Link href={item.href} className="group flex items-center gap-3 py-3">
                <Circle className="size-5 shrink-0 text-slate-300" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.detail}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400 group-hover:text-slate-700" />
              </Link>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
