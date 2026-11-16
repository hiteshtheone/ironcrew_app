"use client";

import { useState } from "react";

import { AddClientForm } from "@/components/add-client-form";
import { StepCard } from "@/components/onboarding/step-layout";
import { Button } from "@/components/ui/button";

export function FirstClientStep({
  position,
  onBack,
  onNext,
}: {
  position: { current: number; total: number };
  onBack: () => void;
  onNext: () => void;
}) {
  const [added, setAdded] = useState(0);
  const [formKey, setFormKey] = useState(0);

  return (
    <StepCard
      position={position}
      title="Add your first client"
      description="When they sign up with this email, their login is linked to this record automatically."
    >
      {added > 0 ? (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {added === 1 ? "Client added." : `${added} clients added.`} Add another or continue.
        </p>
      ) : null}
      <AddClientForm
        key={formKey}
        onSaved={() => {
          setAdded((count) => count + 1);
          setFormKey((key) => key + 1);
        }}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="button" variant={added > 0 ? "default" : "outline"} onClick={onNext}>
          {added > 0 ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </StepCard>
  );
}
