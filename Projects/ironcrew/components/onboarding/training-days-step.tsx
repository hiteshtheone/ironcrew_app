"use client";

import { useState } from "react";

import { StepActions, StepCard } from "@/components/onboarding/step-layout";
import { cn } from "@/lib/utils";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function TrainingDaysStep({
  position,
  initialDays,
  onBack,
  onNext,
}: {
  position: { current: number; total: number };
  initialDays: Weekday[];
  onBack?: () => void;
  onNext: (days: Weekday[]) => void;
}) {
  const [days, setDays] = useState<Weekday[]>(initialDays);

  const toggle = (day: Weekday) =>
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : WEEKDAYS.filter((value) => value === day || current.includes(value)),
    );

  return (
    <StepCard
      position={position}
      title="When can you train?"
      description="Pick the days that usually work for you. This only shapes suggestions; you can schedule any day."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onNext(days);
        }}
        className="flex flex-col gap-5"
      >
        <div className="grid grid-cols-7 gap-2" role="group" aria-label="Training days">
          {WEEKDAYS.map((day) => {
            const selected = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(day)}
                className={cn(
                  "rounded-xl border py-3 text-sm font-semibold transition-colors hover:bg-accent",
                  selected && "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          {days.length === 0
            ? "No days picked yet."
            : `${days.length} ${days.length === 1 ? "day" : "days"} per week.`}
        </p>
        <StepActions onBack={onBack} onSkip={() => onNext([])} />
      </form>
    </StepCard>
  );
}
