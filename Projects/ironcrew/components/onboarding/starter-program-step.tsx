"use client";

import { useState } from "react";

import { StepActions, StepCard } from "@/components/onboarding/step-layout";
import type { StarterProgram } from "@/lib/onboarding/load-onboarding";
import { rankStarterPrograms } from "@/lib/onboarding/starter-programs";
import { todayIn } from "@/lib/onboarding/timezone";
import type { GoalType } from "@/lib/plans/constants";
import { cn } from "@/lib/utils";

/**
 * Trainers copy a system program into their library; clients start one for
 * themselves from today.
 */
export function StarterProgramStep({
  mode,
  position,
  programs,
  goalType,
  trainingDays,
  timezone,
  onBack,
  onDone,
}: {
  mode: "trainer" | "client";
  position: { current: number; total: number };
  programs: StarterProgram[];
  goalType: GoalType | null;
  trainingDays: string[];
  timezone: string;
  onBack?: () => void;
  onDone: (destination: string) => void;
}) {
  const ranked = rankStarterPrograms(programs, goalType);
  const [selectedId, setSelectedId] = useState<string | null>(
    ranked.find((entry) => entry.suggested)?.program.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [overlap, setOverlap] = useState(false);
  const [pending, setPending] = useState(false);

  const blankDestination = "/dashboard?section=programs&creating=program";
  const isTrainer = mode === "trainer";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) {
      onDone(blankDestination);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = isTrainer
        ? await fetch(`/api/programs/${selectedId}/duplicate`, { method: "POST" })
        : await fetch(`/api/me/programs/${selectedId}/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              starts_on: todayIn(timezone),
              goal_title: null,
              goal_type: goalType,
              confirmOverlap: overlap,
            }),
          });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 409 && !isTrainer) {
        setOverlap(true);
        throw new Error("You already follow a program. Continue again to run both at once.");
      }
      if (!response.ok) throw new Error(payload?.error || "Couldn't set up this program");
      onDone(isTrainer ? "/dashboard?section=programs" : "/dashboard");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't set up this program");
    } finally {
      setPending(false);
    }
  };

  return (
    <StepCard
      position={position}
      title={isTrainer ? "Start your program library" : "Pick a starter program"}
      description={
        isTrainer
          ? "Copy a ready-made program to edit and assign, or start from a blank one."
          : trainingDays.length > 0
            ? `Suggested for your goal. You plan to train ${trainingDays.join(", ")}.`
            : "Suggested for your goal. It starts today and fills your calendar."
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {ranked.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            No ready-made programs are available yet. You can build your own.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Starter program" className="grid max-h-80 gap-2 overflow-y-auto pr-1">
            {ranked.map(({ program, suggested }) => {
              const selected = selectedId === program.id;
              return (
                <button
                  key={program.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setSelectedId(selected ? null : program.id);
                    setOverlap(false);
                  }}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-accent",
                    selected && "border-primary ring-2 ring-primary",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {program.name}
                    {suggested ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Suggested
                      </span>
                    ) : null}
                  </span>
                  {program.description ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{program.description}</span>
                  ) : null}
                  {program.durationWeeks ? (
                    <span className="text-xs text-muted-foreground">{program.durationWeeks} weeks</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <StepActions
          onBack={onBack}
          onSkip={() => onDone("/dashboard")}
          skipLabel="Finish later"
          submitLabel={
            selectedId ? (isTrainer ? "Copy and finish" : "Start and finish") : isTrainer ? "Start from blank" : "Build my own"
          }
          pending={pending}
        />
      </form>
    </StepCard>
  );
}
