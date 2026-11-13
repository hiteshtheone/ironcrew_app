import type { SupabaseClient } from "@supabase/supabase-js";

import type { TrainerChecklistFacts } from "@/lib/onboarding/checklist";

/** Counts behind the trainer "Get started" checklist. Null when any read fails. */
export async function loadTrainerChecklistFacts(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerChecklistFacts | null> {
  const [trainer, clients, programs, assignments, linkedClients] = await Promise.all([
    supabase.from("trainers").select("business_name").eq("id", trainerId).maybeSingle(),
    supabase.from("trainer_clients").select("client_id", { count: "exact", head: true }).eq("trainer_id", trainerId),
    supabase.from("programs").select("id", { count: "exact", head: true }).eq("trainer_id", trainerId),
    supabase
      .from("workout_assignments")
      .select("id", { count: "exact", head: true })
      .eq("assigned_by_trainer_id", trainerId),
    supabase
      .from("trainer_clients")
      .select("client_id, clients!inner(profile_id)", { count: "exact", head: true })
      .eq("trainer_id", trainerId)
      .not("clients.profile_id", "is", null),
  ]);

  if (trainer.error || clients.error || programs.error || assignments.error || linkedClients.error) return null;

  return {
    hasBusinessName: Boolean(trainer.data?.business_name?.trim()),
    clientCount: clients.count ?? 0,
    programCount: programs.count ?? 0,
    assignmentCount: assignments.count ?? 0,
    linkedClientCount: linkedClients.count ?? 0,
  };
}
