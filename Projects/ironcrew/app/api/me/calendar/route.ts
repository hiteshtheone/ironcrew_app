import { NextResponse } from "next/server";

import { isIsoDate, jsonError, requireUser } from "@/lib/api/route-utils";
import { requireClientAccount } from "@/lib/api/signed-in-client";
import { loadCalendarAssignments } from "@/lib/dashboard/load-calendar";

export async function GET(request: Request) {
  const range = calendarRange(new URL(request.url).searchParams);
  if ("error" in range) return range.error;

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const client = await requireClientAccount(auth.supabase, auth.user.id);
  if ("error" in client) return client.error;

  const loaded = await loadCalendarAssignments(auth.supabase, {
    from: range.from,
    to: range.to,
    clientId: client.clientId,
  });
  if ("error" in loaded) return jsonError(loaded.error.message, loaded.error.status);
  return NextResponse.json({ workouts: loaded.workouts });
}

function calendarRange(searchParams: URLSearchParams) {
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    return { error: jsonError("from and to must be YYYY-MM-DD, with from on or before to", 400) };
  }
  return { from, to };
}
