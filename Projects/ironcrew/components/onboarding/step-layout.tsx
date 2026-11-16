"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectTimeZone } from "@/lib/onboarding/timezone";

export function StepCard({
  position,
  title,
  description,
  children,
}: {
  position: { current: number; total: number };
  title: string;
  description: string;
  children: ReactNode;
}) {
  const percent = Math.round((position.current / position.total) * 100);
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step {position.current} of {position.total}
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <CardTitle className="pt-2 text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function StepActions({
  onBack,
  onSkip,
  skipLabel = "Skip for now",
  submitLabel = "Continue",
  pendingLabel = "Saving...",
  pending = false,
  submitDisabled = false,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  submitLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <div>
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
            Back
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onSkip ? (
          <Button type="button" variant="outline" onClick={onSkip} disabled={pending}>
            {skipLabel}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || submitDisabled}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Pre-fills the browser timezone once mounted. The server cannot know it, and
 * `fallback` is the stored value; "UTC" is treated as "never set".
 */
export function useDetectedTimeZone(fallback: string) {
  const [timezone, setTimezone] = useState(fallback);
  useEffect(() => {
    if (fallback && fallback !== "UTC") return;
    const detected = detectTimeZone();
    setTimezone((current) => (current === fallback ? detected : current));
  }, [fallback]);
  return [timezone, setTimezone] as const;
}

export function TimezoneField({
  id = "timezone",
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Timezone</Label>
      <Input
        id={id}
        required
        maxLength={100}
        placeholder="Asia/Kolkata"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">Used to decide what &quot;today&quot; and &quot;this week&quot; mean for you.</p>
    </div>
  );
}

/** PATCH /api/me; resolves to an error message, or null on success. */
export async function patchMe(body: Record<string, unknown>) {
  try {
    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error || "Couldn't save your details";
  } catch {
    return "Couldn't save your details";
  }
}
