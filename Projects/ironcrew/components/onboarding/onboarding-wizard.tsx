"use client";

import { useState } from "react";

import { FirstClientStep } from "@/components/onboarding/first-client-step";
import { GoalStep } from "@/components/onboarding/goal-step";
import { InvitedWelcomeStep } from "@/components/onboarding/invited-welcome-step";
import { RoleStep } from "@/components/onboarding/role-step";
import { StarterProgramStep } from "@/components/onboarding/starter-program-step";
import { patchMe } from "@/components/onboarding/step-layout";
import { TrainerBusinessStep } from "@/components/onboarding/trainer-business-step";
import { TrainingDaysStep, type Weekday } from "@/components/onboarding/training-days-step";
import type {
  ClientOnboardingContext,
  ExistingGoal,
  OnboardingContext,
  TrainerOnboardingContext,
} from "@/lib/onboarding/load-onboarding";
import { stepPosition, stepsFor, type OnboardingFlow, type OnboardingStep } from "@/lib/onboarding/steps";

export function OnboardingWizard({ context }: { context: OnboardingContext }) {
  if (context.flow === null) {
    return <RoleStep defaultFirstName={context.defaultFirstName} defaultLastName={context.defaultLastName} />;
  }
  if (context.flow === "trainer") return <TrainerWizard key="trainer" context={context} />;
  return <ClientWizard key={context.flow} context={context} />;
}

/** Step navigation shared by every flow. The saved step lets a return visit resume. */
function useWizard(flow: OnboardingFlow, initialStep: OnboardingStep) {
  const steps = stepsFor(flow);
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const index = steps.indexOf(step);

  const goTo = (next: OnboardingStep) => {
    setStep(next);
    void patchMe({ onboarding_step: next });
  };

  const finish = async (destination = "/dashboard") => {
    setFinishing(true);
    setFinishError(null);
    const failure = await patchMe({ onboarding_completed: true });
    if (failure) {
      setFinishError(failure);
      setFinishing(false);
      return;
    }
    // A full navigation. The client router caches the first visit to /dashboard,
    // which redirected here before onboarding was finished. Reusing that cache
    // sends the user back through /onboarding, whose redirect to /dashboard
    // drops the ?section= and ?creating= query.
    window.location.replace(destination);
  };

  return {
    step,
    position: stepPosition(flow, step),
    next: () => (index < steps.length - 1 ? goTo(steps[index + 1]) : void finish()),
    back: index > 0 ? () => goTo(steps[index - 1]) : undefined,
    finish,
    finishing,
    finishError,
  };
}

function FinishStatus({ finishing, error }: { finishing: boolean; error: string | null }) {
  if (error) return <p className="mt-3 text-center text-sm text-red-500">{error}</p>;
  if (finishing) return <p className="mt-3 text-center text-sm text-muted-foreground">Opening your dashboard...</p>;
  return null;
}

function TrainerWizard({ context }: { context: TrainerOnboardingContext }) {
  const wizard = useWizard("trainer", context.step);

  return (
    <>
      {wizard.step === "business" ? (
        <TrainerBusinessStep
          position={wizard.position}
          trainer={context.trainer}
          timezone={context.timezone}
          onNext={wizard.next}
        />
      ) : wizard.step === "first_client" ? (
        <FirstClientStep position={wizard.position} onBack={wizard.back ?? wizard.next} onNext={wizard.next} />
      ) : (
        <StarterProgramStep
          mode="trainer"
          position={wizard.position}
          programs={context.starterPrograms}
          goalType={null}
          trainingDays={[]}
          timezone={context.timezone}
          onBack={wizard.back}
          onDone={(destination) => void wizard.finish(destination)}
        />
      )}
      <FinishStatus finishing={wizard.finishing} error={wizard.finishError} />
    </>
  );
}

function ClientWizard({ context }: { context: ClientOnboardingContext }) {
  const wizard = useWizard(context.flow, context.step);
  const [goal, setGoal] = useState<ExistingGoal | null>(context.existingGoal);
  const [trainingDays, setTrainingDays] = useState<Weekday[]>([]);
  const [timezone, setTimezone] = useState(context.timezone);

  let content;
  if (wizard.step === "welcome") {
    content = (
      <InvitedWelcomeStep
        position={wizard.position}
        client={context.client}
        trainerName={context.trainerBusinessName}
        timezone={context.timezone}
        onNext={(saved) => {
          setTimezone(saved);
          wizard.next();
        }}
      />
    );
  } else if (wizard.step === "goal") {
    content = (
      <GoalStep
        position={wizard.position}
        existingGoal={goal}
        trainerName={goal === context.existingGoal ? context.trainerBusinessName : null}
        onBack={wizard.back}
        onNext={(chosen) => {
          setGoal(chosen);
          wizard.next();
        }}
      />
    );
  } else if (wizard.step === "training_days") {
    content = (
      <TrainingDaysStep
        position={wizard.position}
        initialDays={trainingDays}
        onBack={wizard.back}
        onNext={(days) => {
          setTrainingDays(days);
          wizard.next();
        }}
      />
    );
  } else {
    content = (
      <StarterProgramStep
        mode="client"
        position={wizard.position}
        programs={context.starterPrograms}
        goalType={goal?.goalType ?? null}
        trainingDays={trainingDays}
        timezone={timezone}
        onBack={wizard.back}
        onDone={(destination) => void wizard.finish(destination)}
      />
    );
  }

  return (
    <>
      {content}
      <FinishStatus finishing={wizard.finishing} error={wizard.finishError} />
    </>
  );
}
