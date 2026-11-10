import { NextResponse } from "next/server";

import { databaseErrorMessage, isIsoDate, jsonError, requireUser } from "@/lib/api/route-utils";
import { loadCalendarAssignments } from "@/lib/dashboard/load-calendar";

export async function GET(request: Request) {
  const range = calendarRange(new URL(request.url).searchParams);
  if ("error" in range) return range.error;

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: profile, error } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) return jsonError(databaseErrorMessage(error), 500);
  if (profile?.role !== "trainer") return jsonError("This account is not a trainer", 403);

  const loaded = await loadCalendarAssignments(auth.supabase, { from: range.from, to: range.to });
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
