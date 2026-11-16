import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { LogoutButton } from "@/components/logout-button";
import { loadOnboarding } from "@/lib/onboarding/load-onboarding";
import { createClient } from "@/lib/supabase/server";

export default function OnboardingPage() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-xl">
        <Suspense fallback={<div className="h-96 rounded-xl border bg-card" />}>
          <AuthenticatedOnboarding />
        </Suspense>
      </div>
    </main>
  );
}

async function AuthenticatedOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const loaded = await loadOnboarding(supabase, user);
  if (loaded.kind === "done") redirect("/dashboard");
  if (loaded.kind === "error") {
    return (
      <div className="rounded-xl border bg-card p-8">
        <h1 className="text-xl font-bold">Couldn&apos;t load your setup</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loaded.message}</p>
        <LogoutButton className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Log out
        </LogoutButton>
      </div>
    );
  }

  return <OnboardingWizard context={loaded.context} />;
}
