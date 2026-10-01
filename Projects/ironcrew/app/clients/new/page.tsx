import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AddClientForm } from "@/components/add-client-form";
import { createClient } from "@/lib/supabase/server";

export default function NewClientPage() {
  return (
    <Suspense fallback={<NewClientSkeleton />}>
      <AuthenticatedNewClient />
    </Suspense>
  );
}

async function AuthenticatedNewClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-slate-500 hover:text-slate-950"
        >
          Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Add client</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the client record fields: name, contact, date of birth, status,
          optional linked profile, and onboarding notes. First name is required.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <AddClientForm />
        </div>
      </div>
    </main>
  );
}

function NewClientSkeleton() {
  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="mt-4 h-9 w-48 rounded-lg bg-slate-200" />
        <div className="mt-8 h-96 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </main>
  );
}
