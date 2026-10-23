import type { ActiveProgramSummary } from "@/lib/api/active-programs";

function sourceLabel(program: ActiveProgramSummary, audience: "trainer" | "client") {
  if (program.source === "self") return audience === "client" ? "self-made" : "self-made by the client";
  return audience === "client" ? "assigned by your trainer" : "assigned by you";
}

/**
 * Shown above the submit button when a client already has an active program and
 * another is being added. Adding is still allowed; the button confirms it.
 */
export function ActiveProgramWarning({
  programs,
  audience,
}: {
  programs: ActiveProgramSummary[];
  audience: "trainer" | "client";
}) {
  if (programs.length === 0) return null;

  const list = programs.map((program) => `${program.name} (${sourceLabel(program, audience)})`).join(", ");
  const lead =
    audience === "client"
      ? `You already have an active program: ${list}. Starting another means you'll have both active at once.`
      : `This client already has an active program: ${list}. Add this one too?`;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2"
    >
      <p className="font-semibold">Active program warning</p>
      <p className="mt-1">{lead}</p>
    </div>
  );
}
