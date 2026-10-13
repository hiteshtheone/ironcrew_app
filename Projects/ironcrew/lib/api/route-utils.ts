import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function isIsoDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asTrimmedString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function asOptionalNumber(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export async function readJson(request: Request) {
  try {
    return { body: (await request.json()) as unknown };
  } catch {
    return { error: jsonError("Invalid JSON body", 400) };
  }
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Unauthorized", 401) };
  return { supabase, user };
}

export function databaseErrorMessage(error: {
  message: string;
  details?: string | null;
  hint?: string | null;
}) {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

export function rpcStatus(message: string) {
  if (/already has an active program/i.test(message)) return 409;
  if (/not authenticated|do not manage|do not own|row-level security/i.test(message)) return 403;
  if (/required|must be|not found|not recognized/i.test(message)) return 400;
  return 500;
}
