"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CLIENT_STATUSES = ["active", "inactive", "archived"] as const;

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  status: (typeof CLIENT_STATUSES)[number];
  onboarding_notes: string;
};

const emptyForm: FormState = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  status: "active",
  onboarding_notes: "",
};

export function AddClientForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          date_of_birth: form.date_of_birth || null,
          status: form.status,
          onboarding_notes: form.onboarding_notes || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to add client");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to add client",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="first_name">First name *</Label>
          <Input
            id="first_name"
            name="first_name"
            required
            maxLength={80}
            autoComplete="given-name"
            value={form.first_name}
            onChange={(event) => updateField("first_name", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="last_name">Last name</Label>
          <Input
            id="last_name"
            name="last_name"
            maxLength={80}
            autoComplete="family-name"
            value={form.last_name}
            onChange={(event) => updateField("last_name", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            required
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="date_of_birth">Date of Birth *</Label>
          <Input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
            value={form.date_of_birth}
            onChange={(event) =>
              updateField("date_of_birth", event.target.value)
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as FormState["status"])
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {CLIENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="onboarding_notes">Onboarding notes</Label>
          <textarea
            id="onboarding_notes"
            name="onboarding_notes"
            rows={5}
            value={form.onboarding_notes}
            onChange={(event) =>
              updateField("onboarding_notes", event.target.value)
            }
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button asChild type="button" variant="outline">
          <Link href="/dashboard">Cancel</Link>
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save client"}
        </Button>
      </div>
    </form>
  );
}
