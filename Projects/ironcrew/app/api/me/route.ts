import { NextResponse } from "next/server";

import {
  asTrimmedString,
  databaseErrorMessage,
  isIsoDate,
  isRecord,
  jsonError,
  readJson,
  requireUser,
} from "@/lib/api/route-utils";

type ProfileRow = {
  role: "client" | "trainer";
  full_name: string;
  timezone: string;
};

type ClientRow = {
  id: string;
};

type GoalDetails = {
  goal: string;
  goal_type: string;
  goal_status: string;
}

type ClientAccount = {
  role: "client";
  linked: boolean;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  timezone: string;
  trainer_business_name: string | null;
  goal: string | null;
  goal_type: string | null;
  goal_status: string | null;
};

type TrainerAccount = {
  role: "trainer";
  first_name: string;
  last_name: string | null;
  business_name: string | null;
  bio: string | null;
  timezone: string;
};

function splitPersonName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: (parts[0] ?? "there").slice(0, 80),
    last_name: parts.slice(1).join(" ").slice(0, 80) || null,
  };
}

function displayName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").slice(0, 120);
}

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isOnOrBeforeToday(value: string) {
  return value <= new Date().toISOString().slice(0, 10);
}

function writeStatus(message: string) {
  if (/row-level security|not authenticated/i.test(message)) return 403;
  if (/check constraint|violates|value too long/i.test(message)) return 400;
  return 500;
}

function nameError(firstName: string | null | undefined, lastName: string | null | undefined) {
  if (firstName === undefined || lastName === undefined) return "Name fields must be strings or null";
  if (firstName == null || firstName.length > 80) {
    return "A first name between 1 and 80 characters is required";
  }
  if (lastName && lastName.length > 80) return "Last name must be 80 characters or fewer";
  return null;
}

function timezoneError(timezone: string | null | undefined) {
  if (timezone === undefined) return "Timezone must be a string";
  if (timezone == null || timezone.length > 100 || !isTimeZone(timezone)) {
    return "Enter a valid timezone, such as Asia/Kolkata";
  }
  return null;
}

function parsedIdentity(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  timezone: string | null | undefined,
): { error: string } | { firstName: string; lastName: string | null; timezone: string } {
  const invalidName = nameError(firstName, lastName);
  if (invalidName || firstName == null || lastName === undefined) {
    return { error: invalidName ?? "A first name between 1 and 80 characters is required" };
  }
  const invalidTimezone = timezoneError(timezone);
  if (invalidTimezone || timezone == null) {
    return { error: invalidTimezone ?? "Enter a valid timezone, such as Asia/Kolkata" };
  }
  return { firstName, lastName, timezone };
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("role, full_name, timezone")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) return jsonError(databaseErrorMessage(profileError), 500);
  if (!profile) return jsonError("No profile was found for this account", 404);

  const account = profile as ProfileRow;
  const loaded =
    account.role === "client"
      ? await loadClient(auth, account)
      : account.role === "trainer"
        ? await loadTrainer(auth, account)
        : jsonError("This account role cannot edit profile details", 400);
  if (loaded instanceof NextResponse) return loaded;
  return NextResponse.json(loaded);
}

export async function PATCH(request: Request) {
  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  if (!isRecord(parsedBody.body)) return jsonError("Request body must be a JSON object", 400);

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("role, full_name, timezone")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) return jsonError(databaseErrorMessage(profileError), 500);
  if (!profile) return jsonError("No profile was found for this account", 404);

  const account = profile as ProfileRow;
  if (account.role === "client") return updateClient(auth, parsedBody.body);
  if (account.role === "trainer") return updateTrainer(auth, parsedBody.body);
  return jsonError("This account role cannot edit profile details", 400);
}

async function loadClient(
  auth: Exclude<Awaited<ReturnType<typeof requireUser>>, { error: NextResponse }>,
  profile: ProfileRow,
) {
  const { data: client, error } = await auth.supabase
    .from("clients")
    .select("first_name, last_name, email, phone, date_of_birth, id")
    .eq("profile_id", auth.user.id)
    .maybeSingle();

  if (error) return jsonError(databaseErrorMessage(error), 500);

  if (!client) {
    const names = splitPersonName(profile.full_name);
    const unlinked: ClientAccount = {
      role: "client",
      linked: false,
      first_name: names.first_name,
      last_name: names.last_name,
      email: null,
      phone: null,
      date_of_birth: null,
      timezone: profile.timezone,
      trainer_business_name: null,
      goal: null,
      goal_type: null,
      goal_status: null,
    };
    return unlinked;
  }

  // Getting Trainer details
  const trainer_business_name = await getTrainer(auth, client)

  // Get goal
  const goal_details = await getGoalDetails(auth, client)

  const linked: ClientAccount = {
    role: "client",
    linked: true,
    first_name: client.first_name,
    last_name: client.last_name,
    email: client.email ?? auth.user.email ?? null,
    phone: client.phone,
    date_of_birth: client.date_of_birth,
    timezone: profile.timezone,
    trainer_business_name: trainer_business_name,
    goal: goal_details.goal,
    goal_type: goal_details.goal_type,
    goal_status: goal_details.goal_status,
  };
  return linked;
}

async function loadTrainer(
  auth: Exclude<Awaited<ReturnType<typeof requireUser>>, { error: NextResponse }>,
  profile: ProfileRow,
) {
  const { data: trainer, error } = await auth.supabase
    .from("trainers")
    .select("first_name, last_name, business_name, bio")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) return jsonError(databaseErrorMessage(error), 500);
  if (!trainer) return jsonError("No trainer profile was found for this account", 404);

  const account: TrainerAccount = {
    role: "trainer",
    first_name: trainer.first_name,
    last_name: trainer.last_name,
    business_name: trainer.business_name,
    bio: trainer.bio,
    timezone: profile.timezone,
  };
  return account;
}

async function updateClient(
  auth: Exclude<Awaited<ReturnType<typeof requireUser>>, { error: NextResponse }>,
  input: Record<string, unknown>,
) {
  const identity = parsedIdentity(
    asTrimmedString(input.first_name),
    asTrimmedString(input.last_name),
    asTrimmedString(input.timezone),
  );
  if ("error" in identity) return jsonError(identity.error, 400);
  const { firstName, lastName, timezone } = identity;

  const { data: client, error: lookupError } = await auth.supabase
    .from("clients")
    .select("id")
    .eq("profile_id", auth.user.id)
    .maybeSingle();

  if (lookupError) return jsonError(databaseErrorMessage(lookupError), 500);

  if (!client) {
    const profileError = await updateProfile(auth, firstName, lastName, timezone);
    if (profileError) return profileError;
    return NextResponse.json({
      role: "client",
      linked: false,
      first_name: firstName,
      last_name: lastName,
      email: null,
      phone: null,
      date_of_birth: null,
      timezone,
      trainer_business_name: null,
      goal: null,
      goal_type: null,
      goal_status: null,
    } satisfies ClientAccount);
  }

  const phone = asTrimmedString(input.phone);
  const dateOfBirth = asTrimmedString(input.date_of_birth);
  if (phone === undefined || dateOfBirth === undefined) {
    return jsonError("Phone and date of birth must be strings or null", 400);
  }
  if (phone && phone.length > 40) return jsonError("Phone must be 40 characters or fewer", 400);
  if (dateOfBirth && (!isIsoDate(dateOfBirth) || !isOnOrBeforeToday(dateOfBirth))) {
    return jsonError("Date of birth must be a past or current date in YYYY-MM-DD", 400);
  }

  const { error: clientError } = await auth.supabase
    .from("clients")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone,
      date_of_birth: dateOfBirth,
    })
    .eq("id", client.id);

  if (clientError) return jsonError(databaseErrorMessage(clientError), writeStatus(clientError.message));

  const profileError = await updateProfile(auth, firstName, lastName, timezone);
  if (profileError) return profileError;

  // No trainer and goal update for now.

  const { data: updated, error: readError } = await auth.supabase
    .from("clients")
    .select("first_name, last_name, email, phone, date_of_birth")
    .eq("id", client.id)
    .maybeSingle();

  if (readError) return jsonError(databaseErrorMessage(readError), 500);
  if (!updated) return jsonError("Couldn't save your details", 500);

  // Getting Trainer details
  const trainer_business_name = await getTrainer(auth, client)

  // Get goal
  const goal_details = await getGoalDetails(auth, client)

  return NextResponse.json({
    role: "client",
    linked: true,
    first_name: updated.first_name,
    last_name: updated.last_name,
    email: updated.email ?? auth.user.email ?? null,
    phone: updated.phone,
    date_of_birth: updated.date_of_birth,
    timezone,
    trainer_business_name: trainer_business_name,
    goal: goal_details.goal,
    goal_type: goal_details.goal_type,
    goal_status: goal_details.goal_status,
  } satisfies ClientAccount);
}

async function updateTrainer(
  auth: Exclude<Awaited<ReturnType<typeof requireUser>>, { error: NextResponse }>,
  input: Record<string, unknown>,
) {
  const businessName = asTrimmedString(input.business_name);
  const bio = asTrimmedString(input.bio);
  const identity = parsedIdentity(
    asTrimmedString(input.first_name),
    asTrimmedString(input.last_name),
    asTrimmedString(input.timezone),
  );
  if ("error" in identity) return jsonError(identity.error, 400);
  const { firstName, lastName, timezone } = identity;
  if (businessName === undefined || bio === undefined) {
    return jsonError("Business name and bio must be strings or null", 400);
  }
  if (businessName && businessName.length > 120) {
    return jsonError("Business name must be 120 characters or fewer", 400);
  }
  if (bio && bio.length > 2000) return jsonError("Bio must be 2000 characters or fewer", 400);

  const { data: trainer, error: trainerError } = await auth.supabase
    .from("trainers")
    .update({
      first_name: firstName,
      last_name: lastName,
      business_name: businessName,
      bio,
    })
    .eq("id", auth.user.id)
    .select("first_name, last_name, business_name, bio")
    .maybeSingle();

  if (trainerError) return jsonError(databaseErrorMessage(trainerError), writeStatus(trainerError.message));
  if (!trainer) return jsonError("No trainer profile was found for this account", 404);

  const profileError = await updateProfile(auth, firstName, lastName, timezone);
  if (profileError) return profileError;

  return NextResponse.json({
    role: "trainer",
    first_name: trainer.first_name,
    last_name: trainer.last_name,
    business_name: trainer.business_name,
    bio: trainer.bio,
    timezone,
  } satisfies TrainerAccount);
}

async function updateProfile(
  auth: Exclude<Awaited<ReturnType<typeof requireUser>>, { error: NextResponse }>,
  firstName: string,
  lastName: string | null,
  timezone: string,
) {
  const { error } = await auth.supabase
    .from("profiles")
    .update({
      full_name: displayName(firstName, lastName),
      timezone,
    })
    .eq("id", auth.user.id);

  if (error) return jsonError(databaseErrorMessage(error), writeStatus(error.message));
  return null;
}

async function getTrainer(
  auth: Exclude<Awaited<ReturnType<typeof requireUser>>, { error: NextResponse }>,
  client: ClientRow,
){
  const { data:trainerClient, error: clientTrainerError } = await auth.supabase
    .from("trainer_clients")
    .select("trainer_id")
    .eq("client_id", client.id)
    .maybeSingle();

  let trainer_business_db
  if (clientTrainerError) {
    console.log("Failed to get trainer Data. Not crashing. Moving on!")
  } else {
    if (trainerClient){
      const { data:trainerData, error: trainerError } = await auth.supabase
        .from("trainers")
        .select("business_name")
        .eq("id", trainerClient.trainer_id)
        .maybeSingle();

      if (trainerData){
        trainer_business_db = trainerData.business_name
      } else {
        console.log("Failed to get trainer Data. Not crashing. Moving on!")
      }
    } else {
      console.log("No tainer associated with this client. Not crashing. Moving on!")
    }
  }
  const trainer_business_name = trainer_business_db?.trim() || "Trainer"
  return trainer_business_name
}

async function getGoalDetails(
  auth: Exclude<Awaited<ReturnType<typeof requireUser>>, { error: NextResponse }>,
  client: ClientRow,
){
  const { data:goal, error: goalError } = await auth.supabase
    .from("goals")
    .select("title, goal_type, status")
    .eq("client_id", client.id)
    .maybeSingle();

  let goal_db, goal_type_db, goal_status_db
  if (goalError) {
    console.log("Failed to get goal Data. Not crashing. Moving on!", goalError.message)
  } else if (goal) {
    goal_db = goal.title
    goal_type_db = goal.goal_type
    goal_status_db = goal.status
  }
  const goal_tittle = goal_db?.trim() || "TBD"
  const goal_type = goal_type_db?.trim() || "TBD"
  const goal_status = goal_status_db?.trim() || "TBD"
  const goal_details: GoalDetails = {
    goal: goal_tittle,
    goal_type: goal_type,
    goal_status: goal_status,
  };

  return goal_details
}
