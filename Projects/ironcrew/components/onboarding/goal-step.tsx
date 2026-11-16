"use client";

import { useState, type ReactNode } from "react";

import { StepActions, StepCard } from "@/components/onboarding/step-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExistingGoal } from "@/lib/onboarding/load-onboarding";
import { GOAL_TYPE_LABELS, GOAL_TYPES, type GoalType } from "@/lib/plans/constants";
import { cn } from "@/lib/utils";

const GOAL_HINTS: Record<GoalType, string> = {
  strength: "Lift heavier on the big lifts.",
  hypertrophy: "Build muscle size.",
  fat_loss: "Lose fat and get leaner.",
  endurance: "Run, ride or swim further.",
  mobility: "Move better with less stiffness.",
  rehabilitation: "Come back from an injury.",
  other: "Something else.",
};

/** Creates a goal through POST /api/me/goals. */
export function GoalForm({
  idPrefix = "goal",
  onSaved,
  renderActions,
}: {
  idPrefix?: string;
  onSaved: (goal: ExistingGoal) => void;
  renderActions: (state: { pending: boolean; ready: boolean }) => ReactNode;
}) {
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!goalType) {
      setError("Choose the goal that fits you best");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/me/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_type: goalType,
          title: title.trim() || null,
          target_date: targetDate || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Couldn't save your goal");
      onSaved({ title: title.trim() || GOAL_TYPE_LABELS[goalType], goalType });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your goal");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Goal type" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GOAL_TYPES.map((value) => {
          const selected = goalType === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setGoalType(value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-accent",
                selected && "border-primary ring-2 ring-primary",
              )}
            >
              <span className="text-sm font-semibold">{GOAL_TYPE_LABELS[value]}</span>
              <span className="text-xs text-muted-foreground">{GOAL_HINTS[value]}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-title`}>Describe it (optional)</Label>
          <Input
            id={`${idPrefix}-title`}
            maxLength={160}
            placeholder="Squat 100 kg"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-target-date`}>Target date</Label>
          <Input
            id={`${idPrefix}-target-date`}
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {renderActions({ pending, ready: goalType !== null })}
    </form>
  );
}

export function GoalStep({
  position,
  existingGoal,
  trainerName,
  onBack,
  onNext,
}: {
  position: { current: number; total: number };
  existingGoal: ExistingGoal | null;
  trainerName: string | null;
  onBack?: () => void;
  onNext: (goal: ExistingGoal | null) => void;
}) {
  const [addingAnother, setAddingAnother] = useState(false);

  if (existingGoal && !addingAnother) {
    return (
      <StepCard
        position={position}
        title="Your goal"
        description={trainerName ? `${trainerName} already set a goal for you.` : "You already have a goal."}
      >
        <div className="rounded-xl border p-4">
          <p className="font-semibold">{existingGoal.title}</p>
          <p className="text-sm text-muted-foreground">{GOAL_TYPE_LABELS[existingGoal.goalType]}</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onNext(existingGoal);
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <Button type="button" variant="link" className="self-start px-0" onClick={() => setAddingAnother(true)}>
            Add another goal
          </Button>
          <StepActions onBack={onBack} />
        </form>
      </StepCard>
    );
  }

  return (
    <StepCard
      position={position}
      title="What are you training for?"
      description="Your goal helps us suggest a program. You can change it later."
    >
      <GoalForm
        onSaved={onNext}
        renderActions={({ pending, ready }) => (
          <StepActions
            onBack={addingAnother ? () => setAddingAnother(false) : onBack}
            onSkip={() => onNext(existingGoal)}
            pending={pending}
            submitDisabled={!ready}
          />
        )}
      />
    </StepCard>
  );
}
