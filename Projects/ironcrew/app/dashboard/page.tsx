import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { ClientListPanel } from "@/components/dashboard/client-list";
import { LogoutButton } from "@/components/logout-button";
import { ProgramsPanel } from "@/components/dashboard/programs-panel";
import { TrainerTraining } from "@/components/dashboard/trainer-training";
import { DashboardSkeleton, TrainerLoadError, TrainerOverview } from "@/components/dashboard/trainer-dashboard";
import { TrainerShell } from "@/components/dashboard/trainer-shell";
import { loadClientDashboard } from "@/lib/dashboard/load-client-dashboard";
import { loadClientList } from "@/lib/dashboard/load-client-list";
import { loadTrainerDashboard } from "@/lib/dashboard/load-trainer-dashboard";
import { loadClientPrograms, loadTrainerPrograms } from "@/lib/dashboard/load-trainer-programs";
import { createClient } from "@/lib/supabase/server";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AuthenticatedDashboard />
    </Suspense>
  );
}

async function AuthenticatedDashboard() {
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

  // First login: no profile yet, so ask whether they are a trainer or a user.
  if (!profile) redirect("/onboarding");

  if (profile.role === "client") {
    const dashboard = await loadClientDashboard(supabase, {
      userId,
      fullName: profile.full_name,
      timezone: profile.timezone,
    });
    // Clients build their own programs; trainer-assigned ones are not loaded here.
    const programs =
      dashboard.kind === "ready" ? await loadClientPrograms(supabase, dashboard.clientId) : null;
    return <ClientDashboard data={dashboard} programs={programs} />;
  }

  const profileInput = {
    userId,
    fullName: profile.full_name,
    timezone: profile.timezone,
  };
  const dashboardPromise = loadTrainerDashboard(supabase, profileInput);
  const clientListPromise = loadClientList(supabase, profileInput);
  const planningPromise = loadTrainerPrograms(supabase, userId);
  const ensured = await supabase.rpc("ensure_trainer_self_client");
  const trainingDashboard = ensured.error
    ? { kind: "error" as const, message: ensured.error.message }
    : await loadClientDashboard(supabase, profileInput);
  const personalProgramsPromise = trainingDashboard.kind === "ready"
    ? loadClientPrograms(supabase, trainingDashboard.clientId)
    : Promise.resolve({
        kind: "error" as const,
        message: trainingDashboard.kind === "error" ? trainingDashboard.message : "Personal programs are not available yet.",
      });
  const [dashboard, clientList, planning, personalPrograms] = await Promise.all([
    dashboardPromise,
    clientListPromise,
    planningPromise,
    personalProgramsPromise,
  ]);

  if (dashboard.kind === "error") {
    return <TrainerLoadError message={dashboard.message} />;
  }

  const programs = planning.kind === "ready"
    ? planning.programs.map((program) => ({ id: program.id, name: program.name, isSystem: program.isSystem }))
    : [];
  const workouts = planning.kind === "ready" ? planning.workouts : [];

  return (
    <TrainerShell
      profile={{
        fullName: dashboard.fullName,
        initials: dashboard.initials,
        dateLabel: dashboard.dateLabel,
      }}
      overview={<TrainerOverview data={dashboard} />}
      training={<TrainerTraining data={trainingDashboard} programs={personalPrograms} />}
      clients={<ClientListPanel data={clientList} programs={programs} workouts={workouts} />}
      programs={
        <ProgramsPanel
          data={planning}
          clients={
            clientList.kind === "ready"
              ? clientList.myClients.map((client) => ({
                  id: client.id,
                  name: client.name,
                  activePrograms: client.activePrograms,
                }))
              : []
          }
          clientsError={clientList.kind === "error" ? clientList.message : null}
          selfClientId={trainingDashboard.kind === "ready" ? trainingDashboard.clientId : null}
          activePrograms={trainingDashboard.kind === "ready" ? trainingDashboard.activePrograms : []}
        />
      }
    />
  );
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
