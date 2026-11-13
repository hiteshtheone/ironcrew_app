import type { SupabaseClient, User } from "@supabase/supabase-js";

import { isGoalType, type GoalType } from "@/lib/plans/constants";
import { resumeStep, type OnboardingFlow, type OnboardingStep } from "@/lib/onboarding/steps";

export type StarterProgram = {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number | null;
};

export type ExistingGoal = { title: string; goalType: GoalType };

export type RoleStepContext = {
  flow: null;
  defaultFirstName: string;
  defaultLastName: string;
};

export type TrainerOnboardingContext = {
  flow: "trainer";
  step: OnboardingStep;
  timezone: string;
  trainer: { firstName: string; lastName: string | null; businessName: string | null; bio: string | null };
  starterPrograms: StarterProgram[];
};

export type ClientOnboardingContext = {
  flow: Extract<OnboardingFlow, "client" | "invited">;
  step: OnboardingStep;
  timezone: string;
  client: { firstName: string; lastName: string | null; phone: string | null; dateOfBirth: string | null };
  trainerBusinessName: string | null;
  existingGoal: ExistingGoal | null;
  starterPrograms: StarterProgram[];
};

export type OnboardingContext = RoleStepContext | TrainerOnboardingContext | ClientOnboardingContext;

export type OnboardingLoad =
  | { kind: "done" }
  | { kind: "error"; message: string }
  | { kind: "ready"; context: OnboardingContext };

export async function loadOnboarding(supabase: SupabaseClient, user: User): Promise<OnboardingLoad> {
  let profile = await readProfile(supabase, user.id);
  if ("error" in profile) return { kind: "error", message: profile.error };

  // A trainer may have already created this person as a client; link that row first.
  if (!profile.row) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_invited_client");
    if (!claimError && claimed) {
      profile = await readProfile(supabase, user.id);
      if ("error" in profile) return { kind: "error", message: profile.error };
    }
  }

  if (!profile.row) return { kind: "ready", context: roleStepContext(user) };
  if (profile.row.onboarding_completed_at) return { kind: "done" };

  const timezone = profile.row.timezone || "UTC";
  const savedStep = profile.row.onboarding_step;
  const starterPrograms = await loadStarterPrograms(supabase);
  if ("error" in starterPrograms) return { kind: "error", message: starterPrograms.error };

  if (profile.row.role === "trainer") {
    const { data: trainer, error } = await supabase
      .from("trainers")
      .select("first_name, last_name, business_name, bio")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return { kind: "error", message: error.message };
    if (!trainer) return { kind: "error", message: "No trainer profile was found for this account" };

    return {
      kind: "ready",
      context: {
        flow: "trainer",
        step: resumeStep("trainer", savedStep),
        timezone,
        trainer: {
          firstName: trainer.first_name,
          lastName: trainer.last_name,
          businessName: trainer.business_name,
          bio: trainer.bio,
        },
        starterPrograms: starterPrograms.programs,
      },
    };
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone, date_of_birth")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (clientError) return { kind: "error", message: clientError.message };
  if (!client) return { kind: "error", message: "This login is not connected to a client profile yet" };

  const [trainerLink, goal] = await Promise.all([
    supabase
      .from("trainer_clients")
      .select("trainers(business_name, first_name, last_name)")
      .eq("client_id", client.id)
      .eq("status", "active")
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("title, goal_type")
      .eq("client_id", client.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (trainerLink.error) return { kind: "error", message: trainerLink.error.message };
  if (goal.error) return { kind: "error", message: goal.error.message };

  const flow = trainerLink.data ? "invited" : "client";
  return {
    kind: "ready",
    context: {
      flow,
      step: resumeStep(flow, savedStep),
      timezone,
      client: {
        firstName: client.first_name,
        lastName: client.last_name,
        phone: client.phone,
        dateOfBirth: client.date_of_birth,
      },
      trainerBusinessName: trainerLink.data ? trainerName(trainerLink.data.trainers) : null,
      existingGoal:
        goal.data && isGoalType(goal.data.goal_type)
          ? { title: goal.data.title, goalType: goal.data.goal_type }
          : null,
      starterPrograms: starterPrograms.programs,
    },
  };
}

type ProfileRow = {
  role: "trainer" | "client";
  timezone: string | null;
  onboarding_step: string | null;
  onboarding_completed_at: string | null;
};

async function readProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ row: ProfileRow | null } | { error: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, timezone, onboarding_step, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { row: (data as ProfileRow | null) ?? null };
}

async function loadStarterPrograms(
  supabase: SupabaseClient,
): Promise<{ programs: StarterProgram[] } | { error: string }> {
  const { data, error } = await supabase
    .from("programs")
    .select("id, name, description, estimated_duration_weeks")
    .is("trainer_id", null)
    .is("owner_client_id", null)
    .order("name", { ascending: true });
  if (error) return { error: error.message };
  return {
    programs: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      durationWeeks: row.estimated_duration_weeks,
    })),
  };
}

function roleStepContext(user: User): RoleStepContext {
  const metadataName = user.user_metadata?.full_name;
  const suggestedName =
    (typeof metadataName === "string" && metadataName.trim()) || user.email?.split("@")[0] || "";
  const parts = suggestedName.trim().split(/\s+/).filter(Boolean);
  return {
    flow: null,
    defaultFirstName: (parts[0] ?? "").slice(0, 80),
    defaultLastName: parts.slice(1).join(" ").slice(0, 80),
  };
}

function trainerName(value: unknown) {
  const trainer = (Array.isArray(value) ? value[0] : value) as
    | { business_name: string | null; first_name: string | null; last_name: string | null }
    | null
    | undefined;
  if (!trainer) return null;
  return (
    trainer.business_name?.trim() ||
    [trainer.first_name, trainer.last_name].filter(Boolean).join(" ").trim() ||
    null
  );
}
