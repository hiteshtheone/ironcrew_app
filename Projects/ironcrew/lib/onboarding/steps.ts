/**
 * Steps after the role step. The role step itself has no id: it runs while the
 * account has no profile row yet.
 */
export type OnboardingFlow = "trainer" | "client" | "invited";

export const ONBOARDING_STEPS = {
  trainer: ["business", "first_client", "starter_program"],
  client: ["goal", "training_days", "starter_program"],
  invited: ["welcome", "goal"],
} as const satisfies Record<OnboardingFlow, readonly string[]>;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[OnboardingFlow][number];

const ALL_STEPS = new Set<string>(Object.values(ONBOARDING_STEPS).flat());

export function isOnboardingStep(value: string): value is OnboardingStep {
  return ALL_STEPS.has(value);
}

export function stepsFor(flow: OnboardingFlow): readonly OnboardingStep[] {
  return ONBOARDING_STEPS[flow];
}

/** The saved step when it belongs to this flow, otherwise the flow's first step. */
export function resumeStep(flow: OnboardingFlow, saved: string | null): OnboardingStep {
  const steps = stepsFor(flow);
  return saved && steps.some((step) => step === saved) ? (saved as OnboardingStep) : steps[0];
}

/** "Step 2 of 4" counts the role step, which invited clients skip. */
export function stepPosition(flow: OnboardingFlow, step: OnboardingStep) {
  const steps = stepsFor(flow);
  const offset = flow === "invited" ? 0 : 1;
  return { current: steps.indexOf(step) + 1 + offset, total: steps.length + offset };
}
