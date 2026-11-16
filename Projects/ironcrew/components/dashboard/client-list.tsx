"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { ClientPlan } from "@/components/dashboard/client-plan";
import { formatShortDate } from "@/lib/dashboard/client-week";
import type { ClientListData, ClientRecord } from "@/lib/dashboard/load-client-list";
import type { WorkoutOption } from "@/lib/dashboard/load-trainer-programs";

type ProgramOption = { id: string; name: string; isSystem?: boolean };

export function ClientListPanel({
  data,
  programs,
  workouts,
}: {
  data: ClientListData;
  programs: ProgramOption[];
  workouts: WorkoutOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (data.kind === "error") {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Clients</h1>
        <p className="mt-2 text-sm text-slate-500">{data.message}</p>
      </div>
    );
  }

  const selected = data.myClients.find((client) => client.id === searchParams.get("client")) ?? null;
  if (selected) {
    return <ClientPlan client={selected} programs={programs} workouts={workouts} />;
  }

  const openClient = (clientId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "clients");
    params.set("client", clientId);
    router.replace(`/dashboard?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-600">{data.greeting}, {data.firstName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Clients</h1>
          <p className="mt-2 text-sm text-slate-500">{activeCountLabel(data.activeClients, data.newClientsLabel)}</p>
        </div>
        <Link href="/clients/new" className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white sm:hidden">
          <Plus className="size-4" /> Add client
        </Link>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold">Active clients</h2>
        {data.myClients.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No clients found.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {data.myClients.map((client) => (
              <li key={client.id}>
                <button type="button" onClick={() => openClient(client.id)} className="flex w-full flex-col gap-4 py-4 text-left sm:flex-row sm:items-center sm:gap-6">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${client.tone}`}>{client.initials}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{client.name}</span>
                      <span className="block truncate text-sm text-slate-500">{client.email ?? "No email"}</span>
                    </span>
                  </span>
                  <span className="min-w-0 sm:w-48">
                    <span className="block truncate text-sm text-slate-700">{client.goalTitle ?? "No goal yet"}</span>
                    <span className="block truncate text-sm text-slate-500">{client.programName ?? "No program yet"}</span>
                  </span>
                  <Consistency percent={client.consistencyPercent} delta={client.consistencyDelta} />
                  <LastWorkout client={client} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function activeCountLabel(active: number, newClientsLabel: string) {
  return `${active} active · ${newClientsLabel}`;
}

function Consistency({ percent, delta }: { percent: number | null; delta: string }) {
  const low = percent !== null && percent < 50;
  return (
    <span className="block sm:w-44 sm:shrink-0">
      <span className="block text-xs font-medium text-slate-500">This month</span>
      <span className="mt-1 flex items-end justify-between gap-3">
        <span className={`text-lg font-bold leading-none ${low ? "text-rose-600" : "text-slate-950"}`}>{percent === null ? "—" : `${percent}%`}</span>
        <span className={`text-xs font-semibold ${deltaTone(delta, percent)}`}>{delta}</span>
      </span>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${low ? "bg-rose-500" : "bg-slate-900"}`} style={{ width: `${percent ?? 0}%` }} />
      </span>
    </span>
  );
}

function LastWorkout({ client }: { client: ClientRecord }) {
  return (
    <span className="block min-w-0 sm:w-40 sm:shrink-0">
      <span className="block text-xs font-medium text-slate-500">Last workout</span>
      {client.lastWorkoutName && client.lastWorkoutOn ? (
        <>
          <span className="mt-1 block truncate text-sm font-semibold">{client.lastWorkoutName}</span>
          <span className="block text-sm text-slate-500">{formatShortDate(client.lastWorkoutOn)}</span>
        </>
      ) : (
        <span className="mt-1 block text-sm text-slate-500">No completed workout</span>
      )}
    </span>
  );
}

function deltaTone(delta: string, percent: number | null) {
  if (percent === null) return "text-slate-500";
  if (delta.startsWith("+")) return "text-emerald-600";
  if (delta.startsWith("-")) return "text-rose-600";
  return "text-slate-500";
}
