"use client";

import { WorkoutsBrowser } from "@/components/dashboard/workouts/workouts-browser";
import type { ClientDashboardData } from "@/lib/dashboard/client-week";

export function ClientWorkouts({ data }: { data: Exclude<ClientDashboardData, { kind: "error" }> }) {
  const ready = data.kind === "ready";

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Workouts</h1>
      <p className="mt-2 text-sm text-slate-500">
        Browse your sessions by status or date, from this week to your full history.
      </p>

      {!ready ? (
        <UnlinkedAccount />
      ) : (
        <div className="mt-6">
          <WorkoutsBrowser
            endpoint="/api/me/workouts"
            emptyMessage="Workouts your trainer assigns to you will show up here."
          />
        </div>
      )}
    </div>
  );
}

function UnlinkedAccount() {
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-bold">Account not linked</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-500">
        Ask your trainer to connect this login to your client record. Your workouts will show up here after that.
      </p>
    </section>
  );
}
