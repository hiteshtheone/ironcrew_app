import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OnboardingForm } from "@/components/onboarding-form";
import { createClient } from "@/lib/supabase/server";

export default function OnboardingPage() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!error && profile) redirect("/dashboard");

  const metadataName = user.user_metadata?.full_name;
  const suggestedName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    user.email?.split("@")[0] ||
    "";
  const parts = suggestedName.trim().split(/\s+/).filter(Boolean);

  return (
    <OnboardingForm
      defaultFirstName={(parts[0] ?? "").slice(0, 80)}
      defaultLastName={parts.slice(1).join(" ").slice(0, 80)}
    />
  );
}
