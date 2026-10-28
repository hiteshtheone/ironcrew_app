"use client";

import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { ClientPlan } from "@/components/dashboard/client-plan";
import type { ClientListData } from "@/lib/dashboard/load-client-list";
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
          <p className="mt-2 text-sm text-slate-500">People you are coaching right now.</p>
        </div>
        <Link href="/clients/new" className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white sm:hidden">
          <Plus className="size-4" /> Add client
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active clients" value={String(data.activeClients)} detail={data.newClientsLabel} icon={Users} tone="bg-violet-50 text-violet-600" />
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold">Active clients</h2>
        {data.myClients.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No clients found.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {data.myClients.map((client) => (
              <li key={client.id}>
                <button type="button" onClick={() => openClient(client.id)} className="flex w-full flex-col gap-1 py-4 text-left sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold">{client.name}</span>
                  <span className="text-sm text-slate-500">{client.email ?? "No email"}</span>
                  <span className="text-sm text-slate-700">{client.goalTitle ?? "No goal yet"}</span>
                  <span className="text-sm text-slate-700">{client.programName ?? "No program yet"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><span className={`grid size-9 place-items-center rounded-xl ${tone}`}><Icon className="size-[18px]" /></span></div>
      <p className="mt-5 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
