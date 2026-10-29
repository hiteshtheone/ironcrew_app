import { NextResponse } from "next/server";

import { jsonError, requireUser } from "@/lib/api/route-utils";
import { requireClientAccount } from "@/lib/api/signed-in-client";
import { listAssignedWorkouts } from "@/lib/dashboard/list-assigned-workouts";

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const listed = await listAssignedWorkouts(auth.supabase, {
    clientId: client.clientId,
    timeZone: client.timeZone,
    searchParams: new URL(request.url).searchParams,
  });
  if ("error" in listed) return jsonError(listed.error.message, listed.error.status);
  return NextResponse.json(listed.page);
}
