import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_PROGRAM_EXISTS = "ACTIVE_PROGRAM_EXISTS";

export type ActiveProgramSource = "trainer" | "self";

export type ActiveProgramSummary = {
  name: string;
  source: ActiveProgramSource;
};

export function isActiveProgramExistsError(error: { message: string }) {
  return error.message.includes(ACTIVE_PROGRAM_EXISTS);
}

/** Active (scheduled or in progress) programs a client currently has. */
export async function loadActivePrograms(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ActiveProgramSummary[]> {
  const { data } = await supabase
    .from("program_assignments")
    .select("assigned_by_client_id, programs(name)")
    .eq("client_id", clientId)
    .in("status", ["scheduled", "in_progress"])
    .order("starts_on", { ascending: false });

  return (data ?? []).map((row) => {
    const source: ActiveProgramSource = row.assigned_by_client_id ? "self" : "trainer";
    const relation = Array.isArray(row.programs) ? row.programs[0] : row.programs;
    const name = typeof relation?.name === "string" && relation.name ? relation.name : null;
    // A trainer cannot read a client's self-made program, so fall back to a label.
    return { name: name ?? "Self-made program", source };
  });
}

/** 409 response telling the UI to warn and ask for confirmation before retrying. */
export async function activeProgramConflict(supabase: SupabaseClient, clientId: string) {
  const activePrograms = await loadActivePrograms(supabase, clientId);
  return NextResponse.json(
    {
      error: "This client already has an active program",
      code: "active_program_exists",
      activePrograms,
    },
    { status: 409 },
  );
}
