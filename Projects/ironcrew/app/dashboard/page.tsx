import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { ClientListPanel } from "@/components/dashboard/client-list";
import { LogoutButton } from "@/components/logout-button";
import { ProgramsPanel } from "@/components/dashboard/programs-panel";
import { DashboardSkeleton, TrainerLoadError, TrainerOverview } from "@/components/dashboard/trainer-dashboard";
import { TrainerShell } from "@/components/dashboard/trainer-shell";
import { loadClientDashboard } from "@/lib/dashboard/load-client-dashboard";
import { loadClientList } from "@/lib/dashboard/load-client-list";
import { loadTrainerDashboard } from "@/lib/dashboard/load-trainer-dashboard";
import { loadClientPrograms, loadTrainerPrograms } from "@/lib/dashboard/load-trainer-programs";
import { clientChecklist, isChecklistVisible, trainerChecklist } from "@/lib/onboarding/checklist";
import { loadTrainerChecklistFacts } from "@/lib/onboarding/load-checklist";
import { createClient } from "@/lib/supabase/server";

const PROFILE_COLUMNS = "role, full_name, timezone, onboarding_completed_at, checklist_dismissed_at";

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
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return <DashboardNotice title="Couldn't load your profile" detail={error.message} />;
  }

  // A trainer may have already created this person as a client. Link that row
  // and skip the role form. Everyone else still chooses a role on /onboarding.
  let activeProfile = profile;
  if (!activeProfile) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_invited_client");
    // The hosted database may not have this function yet. A missing function is
    // the same as "not an invited client": continue to onboarding.
    const functionMissing =
      claimError?.code === "PGRST202" ||
      (claimError != null && /could not find the function/i.test(claimError.message));
    if (claimError && !functionMissing) {
      return <DashboardNotice title="Couldn't finish signing you in" detail={claimError.message} />;
    }
    if (!claimed || functionMissing) redirect("/onboarding");

    const reloaded = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (reloaded.error) {
      return <DashboardNotice title="Couldn't load your profile" detail={reloaded.error.message} />;
    }
    if (!reloaded.data) redirect("/onboarding");
    activeProfile = reloaded.data;
  }

  // Invited clients are claimed above with a fresh profile, so they also land here.
  if (!activeProfile.onboarding_completed_at) redirect("/onboarding");

  if (activeProfile.role === "client") {
    const dashboard = await loadClientDashboard(supabase, {
      userId,
      fullName: activeProfile.full_name,
      timezone: activeProfile.timezone,
    });
    // Clients build their own programs; trainer-assigned ones are not loaded here.
    const programs =
      dashboard.kind === "ready" ? await loadClientPrograms(supabase, dashboard.clientId) : null;
    const items =
      dashboard.kind === "ready"
        ? clientChecklist({
            hasGoal: dashboard.hasGoal,
            hasStartedProgram: dashboard.hasStartedProgram,
            hasLoggedWorkout: dashboard.hasLoggedWorkout,
          })
        : [];
    const checklist = isChecklistVisible(items, activeProfile.checklist_dismissed_at) ? items : null;
    return <ClientDashboard data={dashboard} programs={programs} checklist={checklist} />;
  }

  const profileInput = {
    userId,
    fullName: activeProfile.full_name,
    timezone: activeProfile.timezone,
  };
  const [dashboard, clientList, planning, checklistFacts] = await Promise.all([
    loadTrainerDashboard(supabase, profileInput),
    loadClientList(supabase, profileInput),
    loadTrainerPrograms(supabase, userId),
    activeProfile.checklist_dismissed_at ? null : loadTrainerChecklistFacts(supabase, userId),
  ]);
  const checklistItems = checklistFacts ? trainerChecklist(checklistFacts) : [];
  const checklist = isChecklistVisible(checklistItems, activeProfile.checklist_dismissed_at) ? checklistItems : null;

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
      today={dashboard.today}
      overview={<TrainerOverview data={dashboard} checklist={checklist} />}
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
