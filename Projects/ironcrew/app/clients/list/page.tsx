import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LogoutButton } from "@/components/logout-button";
import { ClientListSkeleton, ClientListDashboard } from "@/components/dashboard/client-list";
import { loadClientList } from "@/lib/dashboard/load-client-list";
import { createClient } from "@/lib/supabase/server";

export default function ClientListPage() {
  return (
    <Suspense fallback={<ClientListSkeleton />}>
      <AuthenticatedClientList />
    </Suspense>
  );
}

//Load client list if user is authenticated and user is trainer.
async function AuthenticatedClientList() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (!userId) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, full_name, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return <DashboardNotice title="Couldn't load your profile" detail={error.message} />;
  }

  if (!profile) {
    return <DashboardNotice title="Couldn't load your profile" detail="No profile was found for this account." />;
  }

  if (profile.role === "client") {
    return <DashboardNotice title="No client list for you." detail="You are registered as client. So, you don't have a client-list." />;
  }

  const dashboard = await loadClientList(supabase, {
    userId,
    fullName: profile.full_name,
    timezone: profile.timezone,
  });
  return <ClientListDashboard data={dashboard} />;
}

function DashboardNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6 text-slate-950">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{detail}</p>
        <LogoutButton className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Log out
        </LogoutButton>
      </div>
    </main>
  );
}
