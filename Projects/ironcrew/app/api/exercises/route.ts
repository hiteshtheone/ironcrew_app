import { NextResponse } from "next/server";

import { resolveOwner } from "@/lib/api/owner";
import { readJson, requireUser } from "@/lib/api/route-utils";
import { exerciseWriteError, parseExerciseWrite } from "@/lib/exercises/input";

export async function POST(request: Request) {
  const parsedBody = await readJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = parseExerciseWrite(parsedBody.body, "create");
  if ("error" in parsed) return parsed.error;

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const resolved = await resolveOwner(auth.supabase, auth.user.id);
  if ("error" in resolved) return resolved.error;

  const exercise = parsed.value;
  const { data, error } = await auth.supabase
    .from("exercises")
    .insert({
      ...resolved.owner,
      name: exercise.name,
      tracking_type: exercise.trackingType,
      tracking_parameters: exercise.trackingParameters,
      primary_muscle_group: exercise.primaryMuscleGroup,
      secondary_muscle_group: exercise.secondaryMuscleGroup,
    })
    .select("id, name")
    .single();

  if (error) return exerciseWriteError(error);

  return NextResponse.json(data, { status: 201 });
}
