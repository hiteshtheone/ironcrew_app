"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Target } from "lucide-react";

import { GoalForm } from "@/components/onboarding/goal-step";
import { Button } from "@/components/ui/button";

/** Shown to clients until they (or their trainer) have a goal. It cannot be dismissed. */
export function GoalPendingBanner() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div id="set-goal" className="border-b border-amber-200 bg-amber-50 px-5 py-4 sm:px-8" role="status">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <Target className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">Onboarding pending</p>
              <p className="text-sm text-amber-800">Finish setting up: add your goal so your plan can be tailored.</p>
            </div>
          </div>
          {open ? null : (
            <Button type="button" onClick={() => setOpen(true)} className="bg-slate-950 text-white hover:bg-slate-800">
              Set goal
            </Button>
          )}
        </div>
        {open ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-5">
            <GoalForm
              idPrefix="banner-goal"
              onSaved={() => router.refresh()}
              renderActions={({ pending, ready }) => (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                    Not now
                  </Button>
                  <Button type="submit" disabled={pending || !ready}>
                    {pending ? "Saving..." : "Save goal"}
                  </Button>
                </div>
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
