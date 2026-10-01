import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const CLIENT_STATUSES = ["active", "inactive", "archived"] as const;
const CLIENT_FIELDS =
  "id, profile_id, first_name, last_name, email, phone, date_of_birth, status, onboarding_notes, created_at, updated_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClientStatus = (typeof CLIENT_STATUSES)[number];

type ClientInsert = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  status: ClientStatus;
  onboarding_notes: string | null;
  profile_id: string | null;
};

function asTrimmedString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseClientPayload(
  body: unknown,
): { payload: ClientInsert } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" };
  }

  const input = body as Record<string, unknown>;
  const firstName = asTrimmedString(input.first_name);
  if (firstName === undefined) {
    return { error: "first_name must be a string" };
  }
  if (firstName == null || firstName.length > 80) {
    return { error: "A first_name between 1 and 80 characters is required" };
  }

  const lastName = asTrimmedString(input.last_name);
  const email = asTrimmedString(input.email);
  const phone = asTrimmedString(input.phone);
  const onboardingNotes = asTrimmedString(input.onboarding_notes);
  const profileId = asTrimmedString(input.profile_id);
  const dateOfBirth = asTrimmedString(input.date_of_birth);

  if (
    lastName === undefined ||
    email === undefined ||
    phone === undefined ||
    onboardingNotes === undefined ||
    profileId === undefined ||
    dateOfBirth === undefined
  ) {
    return { error: "Optional client fields must be strings or null" };
  }

  if (lastName && lastName.length > 80) {
    return { error: "last_name must be 80 characters or fewer" };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "email must be a valid email address" };
  }

  if (profileId && !UUID_PATTERN.test(profileId)) {
    return { error: "profile_id must be a valid UUID" };
  }

  if (dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return { error: "date_of_birth must be YYYY-MM-DD" };
    }
    const parsed = new Date(`${dateOfBirth}T00:00:00`);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (Number.isNaN(parsed.getTime()) || parsed > today) {
      return { error: "date_of_birth must be a date on or before today" };
    }
  }

  let status: ClientStatus = "active";
  if (input.status != null && input.status !== "") {
    if (
      typeof input.status !== "string" ||
      !CLIENT_STATUSES.includes(input.status as ClientStatus)
    ) {
      return { error: "status must be active, inactive, or archived" };
    }
    status = input.status as ClientStatus;
  }

  return {
    payload: {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      date_of_birth: dateOfBirth,
      status,
      onboarding_notes: onboardingNotes,
      profile_id: profileId,
    },
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_FIELDS)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseClientPayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("clients")
    .insert(parsed.payload)
    .select(CLIENT_FIELDS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A client with this email already exists" },
        { status: 409 },
      );
    }
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      return NextResponse.json(
        { error: "You must be a trainer to add clients" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: relationshipError } = await supabase
    .from("trainer_clients")
    .insert({
      trainer_id: user.id,
      client_id: data.id,
      is_primary: true,
      status: parsed.payload.status,
    });

  if (relationshipError) {
    await supabase.from("clients").delete().eq("id", data.id);
    return NextResponse.json(
      { error: relationshipError.message },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: Request) {
  const { first_name } = await request.json();

  if (typeof first_name !== "string" || !first_name.trim()) {
    return NextResponse.json(
      { error: "A first_name is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ first_name: first_name.trim() })
    .select("id, first_name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: errorDel } = await supabase
    .from("clients")
    .delete()
    .eq("id", data.id)
    .single();

  if (errorDel) {
    return NextResponse.json({ error: errorDel.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
