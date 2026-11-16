"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EditSaveActions, useEditMode, valuesEqual } from "@/components/edit-save-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, isGoalStatus, isGoalType } from "@/lib/plans/constants";

type ClientGoal = {
  id: string;
  title: string;
  goal_type: string;
  status: string;
  target_date: string | null;
  set_by: "self" | "coach";
  coach_name: string | null;
};

type ClientAccount = {
  role: "client";
  linked: boolean;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  timezone: string;
  trainer_business_name: string | null;
  goals: ClientGoal[];
};

type TrainerAccount = {
  role: "trainer";
  first_name: string;
  last_name: string | null;
  business_name: string | null;
  bio: string | null;
  timezone: string;
};

type Account = ClientAccount | TrainerAccount;

type FormState = {
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string;
  business_name: string;
  bio: string;
  timezone: string;
};

const emptyForm: FormState = {
  first_name: "",
  last_name: "",
  phone: "",
  date_of_birth: "",
  business_name: "",
  bio: "",
  timezone: "UTC",
};

function goalTypeLabel(value: string) {
  return isGoalType(value) ? GOAL_TYPE_LABELS[value] : value;
}

function goalStatusLabel(value: string) {
  return isGoalStatus(value) ? GOAL_STATUS_LABELS[value] : value;
}

function setByLabel(goal: ClientGoal) {
  if (goal.set_by === "self") return "Set by self";
  return goal.coach_name ? `Set by ${goal.coach_name}` : "Set by coach";
}

function formatTargetDate(ymd: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

function formFromAccount(account: Account): FormState {
  return {
    first_name: account.first_name ?? "",
    last_name: account.last_name ?? "",
    phone: account.role === "client" ? (account.phone ?? "") : "",
    date_of_birth: account.role === "client" ? (account.date_of_birth ?? "").slice(0, 10) : "",
    business_name: account.role === "trainer" ? (account.business_name ?? "") : "",
    bio: account.role === "trainer" ? (account.bio ?? "") : "",
    timezone: account.timezone || "UTC",
  };
}

export function MyInfoForm() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { editing, startEditing, stopEditing } = useEditMode("me");
  const baseline = account ? formFromAccount(account) : emptyForm;
  const dirty = !valuesEqual(form, baseline);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/me")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as (Account & { error?: string }) | null;
        if (!response.ok) throw new Error(payload?.error || "Couldn't load your details");
        if (!payload || (payload.role !== "client" && payload.role !== "trainer")) {
          throw new Error("Couldn't load your details");
        }
        if (cancelled) return;
        setAccount(payload);
        setForm(formFromAccount(payload));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadError(caught instanceof Error ? caught.message : "Couldn't load your details");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (key: keyof FormState, value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const cancelEdit = () => {
    if (!account) return;
    setForm(formFromAccount(account));
    setError(null);
    stopEditing();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || !editing || !dirty) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);

    const body =
      account.role === "trainer"
        ? {
            first_name: form.first_name,
            last_name: form.last_name || null,
            business_name: form.business_name || null,
            bio: form.bio || null,
            timezone: form.timezone,
          }
        : account.linked
          ? {
              first_name: form.first_name,
              last_name: form.last_name || null,
              phone: form.phone || null,
              date_of_birth: form.date_of_birth || null,
              timezone: form.timezone,
            }
          : {
              first_name: form.first_name,
              last_name: form.last_name || null,
              timezone: form.timezone,
            };

    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as (Account & { error?: string }) | null;
      if (!response.ok) throw new Error(payload?.error || "Couldn't save your details");
      if (!payload || (payload.role !== "client" && payload.role !== "trainer")) {
        throw new Error("Couldn't save your details");
      }
      setAccount(payload);
      setForm(formFromAccount(payload));
      setSaved(true);
      stopEditing();
      router.refresh();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Couldn't save your details");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1>
      <p className="mt-2 text-sm text-slate-500">Update the name and details on your account.</p>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold">My info</h2>
        {isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading your details…</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-red-500">{loadError}</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            {account?.role === "client" && !account.linked && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                This login is not connected to a client profile yet. You can still update your name and timezone.
              </p>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="first_name">First name</Label>
                <Input
                  id="first_name"
                  name="first_name"
                  required
                  maxLength={80}
                  autoComplete="given-name"
                  disabled={!editing}
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
                  disabled={!editing}
                  value={form.last_name}
                  onChange={(event) => updateField("last_name", event.target.value)}
                />
              </div>
              {account?.role === "client" && account.linked && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" value={account.email ?? ""} disabled />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      maxLength={40}
                      autoComplete="tel"
                      disabled={!editing}
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="date_of_birth">Date of birth</Label>
                    <Input
                      id="date_of_birth"
                      name="date_of_birth"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      disabled={!editing}
                      value={form.date_of_birth}
                      onChange={(event) => updateField("date_of_birth", event.target.value)}
                    />
                  </div>
                </>
              )}
              {account?.role === "trainer" && (
                <>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="business_name">Business name</Label>
                    <Input
                      id="business_name"
                      name="business_name"
                      maxLength={120}
                      disabled={!editing}
                      value={form.business_name}
                      onChange={(event) => updateField("business_name", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="bio">Bio</Label>
                    <textarea
                      id="bio"
                      name="bio"
                      rows={4}
                      maxLength={2000}
                      disabled={!editing}
                      value={form.bio}
                      onChange={(event) => updateField("bio", event.target.value)}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-slate-50"
                    />
                  </div>
                </>
              )}
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  name="timezone"
                  required
                  maxLength={100}
                  placeholder="Asia/Kolkata"
                  disabled={!editing}
                  value={form.timezone}
                  onChange={(event) => updateField("timezone", event.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {saved && <p className="text-sm text-emerald-600">Saved.</p>}

            <EditSaveActions
              appearance="button"
              className="flex flex-wrap items-center justify-end gap-2"
              editing={editing}
              dirty={dirty}
              pending={isSaving}
              saveLabel="Save"
              pendingLabel="Saving…"
              saveClassName="bg-slate-950 text-white hover:bg-slate-800"
              onEdit={startEditing}
              onCancel={cancelEdit}
            />
          </form>
        )}
      </section>

      {account?.role === "client" && account.linked ? (
        <ClientGoals trainerName={account.trainer_business_name} goals={account.goals ?? []} />
      ) : null}
    </div>
  );
}

function ClientGoals({ trainerName, goals }: { trainerName: string | null; goals: ClientGoal[] }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold">Goals</h2>
      <p className="mt-1 text-sm text-slate-500">Trainer · {trainerName ?? "Trainer"}</p>
      {goals.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No goal yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {goals.map((goal) => (
            <li key={goal.id} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold">{goal.title}</p>
              <p className="mt-1 text-sm text-slate-500">
                {goalTypeLabel(goal.goal_type)} · {goalStatusLabel(goal.status)}
                {goal.target_date ? ` · ${formatTargetDate(goal.target_date)}` : ""}
                {" · "}
                {setByLabel(goal)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
