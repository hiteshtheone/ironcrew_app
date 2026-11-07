import type { SupabaseClient } from "@supabase/supabase-js";

import { databaseErrorMessage, jsonError, rpcStatus } from "@/lib/api/route-utils";

export type OwnerColumns =
  | { trainer_id: string; owner_client_id?: undefined }
  | { owner_client_id: string; trainer_id?: undefined };

/**
 * Resolves which ownership column a new program, workout, or exercise should use
 * for the signed-in user. Trainers own by `trainer_id` unless `forSelf` is set,
 * in which case the row belongs to their personal client. Clients own by
 * `owner_client_id`.
 *
 * This only decides which column to write. Row-level security remains the
 * authority: a mismatched owner is rejected by the database.
 */
export function forSelfRequested(body: Record<string, unknown>) {
  return body.for_self === true;
}

export async function resolveOwner(
  supabase: SupabaseClient,
  userId: string,
  options?: { forSelf?: boolean },
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) return { error: jsonError(databaseErrorMessage(profileError), 500) };
  if (!profile) return { error: jsonError("Finish onboarding before creating programs", 403) };

  const forSelf = options?.forSelf === true;
  if (profile.role === "client" || forSelf) {
    if (profile.role === "trainer") {
      const { error: ensureError } = await supabase.rpc("ensure_trainer_self_client");
      if (ensureError) {
        return { error: jsonError(databaseErrorMessage(ensureError), rpcStatus(ensureError.message)) };
      }
    } else if (profile.role !== "client") {
      return { error: jsonError("Finish onboarding before creating programs", 403) };
    }

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
