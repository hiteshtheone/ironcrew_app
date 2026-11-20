import { databaseErrorMessage, jsonError, requireUser, rpcStatus } from "@/lib/api/route-utils";

/** Download the rows this login holds: profile, training, and clients they coach. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.rpc("export_own_account");
  if (error) return jsonError(databaseErrorMessage(error), rpcStatus(error.message));

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="sema-fitness-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
