"use client";

import { useState } from "react";

import { StepActions, StepCard, TimezoneField, patchMe, useDetectedTimeZone } from "@/components/onboarding/step-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientOnboardingContext } from "@/lib/onboarding/load-onboarding";

export function InvitedWelcomeStep({
  position,
  client,
  trainerName,
  timezone: storedTimezone,
  onNext,
}: {
  position: { current: number; total: number };
  client: ClientOnboardingContext["client"];
  trainerName: string | null;
  timezone: string;
  onNext: (timezone: string) => void;
}) {
  const [firstName, setFirstName] = useState(client.firstName);
  const [lastName, setLastName] = useState(client.lastName ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState((client.dateOfBirth ?? "").slice(0, 10));
  const [timezone, setTimezone] = useDetectedTimeZone(storedTimezone);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const failure = await patchMe({
      first_name: firstName,
      last_name: lastName || null,
      phone: phone || null,
      date_of_birth: dateOfBirth || null,
      timezone,
    });
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    onNext(timezone);
  };

  return (
    <StepCard
      position={position}
      title={`Welcome, ${client.firstName}`}
      description={`${trainerName ?? "Your trainer"} set up your account. Check your details before you start.`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="welcome-first-name">First name</Label>
            <Input
              id="welcome-first-name"
              required
              maxLength={80}
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="welcome-last-name">Last name</Label>
            <Input
              id="welcome-last-name"
              maxLength={80}
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="welcome-phone">Phone</Label>
            <Input
              id="welcome-phone"
              type="tel"
              maxLength={40}
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="welcome-dob">Date of birth</Label>
            <Input
              id="welcome-dob"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
            />
          </div>
        </div>
        <TimezoneField id="welcome-timezone" value={timezone} onChange={setTimezone} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <StepActions pending={pending} />
      </form>
    </StepCard>
  );
}
