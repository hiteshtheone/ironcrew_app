import { databaseErrorMessage, jsonError, requireUser, rpcStatus } from "@/lib/api/route-utils";

/** Delete the signed-in login and the training data that belongs to it. */
export async function DELETE() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { error } = await auth.supabase.rpc("delete_own_account");
  if (error) return jsonError(databaseErrorMessage(error), rpcStatus(error.message));

  await auth.supabase.auth.signOut();
  return new Response(null, { status: 204 });
}
