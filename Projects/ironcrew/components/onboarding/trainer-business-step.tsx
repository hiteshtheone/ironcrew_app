"use client";

import { useState } from "react";

import { StepActions, StepCard, patchMe } from "@/components/onboarding/step-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TrainerOnboardingContext } from "@/lib/onboarding/load-onboarding";

export function TrainerBusinessStep({
  position,
  trainer,
  timezone,
  onNext,
}: {
  position: { current: number; total: number };
  trainer: TrainerOnboardingContext["trainer"];
  timezone: string;
  onNext: () => void;
}) {
  const [businessName, setBusinessName] = useState(trainer.businessName ?? "");
  const [bio, setBio] = useState(trainer.bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const failure = await patchMe({
      first_name: trainer.firstName,
      last_name: trainer.lastName,
      business_name: businessName.trim() || null,
      bio: bio.trim() || null,
      timezone,
    });
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    onNext();
  };

  return (
    <StepCard
      position={position}
      title="Your coaching business"
      description="Clients see this name in their app instead of a generic 'Trainer'."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="business-name">Business name</Label>
          <Input
            id="business-name"
            maxLength={120}
            placeholder="Iron Coaching"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bio">Short bio (optional)</Label>
          <textarea
            id="bio"
            rows={4}
            maxLength={2000}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <StepActions onSkip={onNext} pending={pending} />
      </form>
    </StepCard>
  );
}
