import type { SupabaseClient } from "@supabase/supabase-js";

import { databaseErrorMessage, jsonError } from "@/lib/api/route-utils";

export type OwnerColumns =
  | { trainer_id: string; owner_client_id?: undefined }
  | { owner_client_id: string; trainer_id?: undefined };

/**
 * Resolves which ownership column a new program, workout, or exercise should use
 * for the signed-in user. Trainers own by `trainer_id`; clients by `owner_client_id`.
 *
 * This only decides which column to write. Row-level security remains the
 * authority: a mismatched owner is rejected by the database.
 */
export async function resolveOwner(supabase: SupabaseClient, userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) return { error: jsonError(databaseErrorMessage(profileError), 500) };
  if (!profile) return { error: jsonError("Finish onboarding before creating programs", 403) };

  if (profile.role === "client") {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (clientError) return { error: jsonError(databaseErrorMessage(clientError), 500) };
    if (!client?.id) {
      return { error: jsonError("This login is not connected to a client profile", 404) };
    }
    return { owner: { owner_client_id: client.id as string } satisfies OwnerColumns };
  }

  return { owner: { trainer_id: userId } satisfies OwnerColumns };
}
