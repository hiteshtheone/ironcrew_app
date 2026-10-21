import type { SupabaseClient } from "@supabase/supabase-js";

import { databaseErrorMessage, jsonError } from "@/lib/api/route-utils";
import { resolveTimeZone } from "@/lib/dashboard/client-week";

export async function requireClientAccount(supabase: SupabaseClient, userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) return { error: jsonError(databaseErrorMessage(profileError), 500) };
  if (!profile || profile.role !== "client") return { error: jsonError("This account is not a client", 403) };

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();

  if (clientError) return { error: jsonError(databaseErrorMessage(clientError), 500) };
  if (!client?.id) return { error: jsonError("This login is not connected to a client profile", 404) };

  return {
    clientId: client.id as string,
    timeZone: resolveTimeZone(typeof profile.timezone === "string" ? profile.timezone : null),
  };
}
