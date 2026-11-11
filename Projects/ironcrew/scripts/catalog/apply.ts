import type { CatalogDocument, CatalogExercise } from "./document";
import { CatalogError } from "./document";

export type SqlClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type ApplyCounts = {
  exercises: RowCounts;
  workouts: RowCounts;
  programs: RowCounts;
};

type RowCounts = { created: number; updated: number };

const emptyCounts = (): ApplyCounts => ({
  exercises: { created: 0, updated: 0 },
  workouts: { created: 0, updated: 0 },
  programs: { created: 0, updated: 0 },
});

export async function applyDocument(client: SqlClient, document: CatalogDocument, label: string): Promise<ApplyCounts> {
  const counts = emptyCounts();
  const definedExerciseIds = new Set(document.exercises.flatMap((exercise) => (exercise.id ? [exercise.id] : [])));
  const definedWorkoutIds = new Set(document.workouts.flatMap((workout) => (workout.id ? [workout.id] : [])));
  await assertCatalogIds(
    client,
    "exercises",
    "exercise",
    document.workouts.flatMap((workout) => workout.blocks.flatMap((block) => (block.exerciseId ? [block.exerciseId] : []))),
    definedExerciseIds,
    label,
  );
  await assertCatalogIds(
    client,
    "workouts",
    "workout",
    document.programs.flatMap((program) =>
      program.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.days.flatMap((day) => (day.workoutId ? [day.workoutId] : [])))),
    ),
    definedWorkoutIds,
    label,
  );
  const exerciseIds = await resolveSharedIds(
    client,
    "exercises",
    "exercise",
    document.workouts.flatMap((workout) => workout.blocks.flatMap((block) => (block.exercise ? [block.exercise] : []))),
    new Set(document.exercises.map((exercise) => exercise.name)),
    label,
  );
  const workoutIds = await resolveSharedIds(
    client,
    "workouts",
    "workout",
    document.programs.flatMap((program) =>
      program.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.days.flatMap((day) => (day.workoutName ? [day.workoutName] : [])))),
    ),
    new Set(document.workouts.map((workout) => workout.name)),
    label,
  );

  for (const exercise of document.exercises) {
    const existing = exercise.id
      ? await sharedRowId(client, "exercises", "exercise", exercise.id, label)
      : (exerciseIds.get(exercise.name) ?? (await findSharedId(client, "exercises", exercise.name)));
    if (existing) {
      await client.query(
        `update public.exercises
         set name = $2,
             description = $3,
             instructions = $4,
             primary_muscle_group = $5::public.muscle,
             equipment = $6,
             video_url = $7,
             secondary_muscle_groups = $8::public.muscle[],
             body_parts = $9::public.body_part[],
             tracking_type = coalesce($10::public.exercise_tracking_type, tracking_type),
             tracking_parameters = coalesce($11::public.exercise_tracking_parameter[], tracking_parameters)
         where id = $1`,
        [existing, ...exerciseValues(exercise)],
      );
      exerciseIds.set(exercise.name, existing);
      counts.exercises.updated += 1;
    } else {
      const inserted = await client.query(
        exercise.id
          ? `insert into public.exercises (
               id, trainer_id, owner_client_id, name, description, instructions, primary_muscle_group, equipment, video_url,
               secondary_muscle_groups, body_parts, tracking_type, tracking_parameters
             ) values (
               $1, null, null, $2, $3, $4, $5::public.muscle, $6, $7, $8::public.muscle[], $9::public.body_part[],
               coalesce($10::public.exercise_tracking_type, 'custom'),
               coalesce($11::public.exercise_tracking_parameter[], array['weight', 'reps', 'time', 'distance']::public.exercise_tracking_parameter[])
             )
             returning id`
          : `insert into public.exercises (
               trainer_id, owner_client_id, name, description, instructions, primary_muscle_group, equipment, video_url,
               secondary_muscle_groups, body_parts, tracking_type, tracking_parameters
             ) values (
               null, null, $1, $2, $3, $4::public.muscle, $5, $6, $7::public.muscle[], $8::public.body_part[],
               coalesce($9::public.exercise_tracking_type, 'custom'),
               coalesce($10::public.exercise_tracking_parameter[], array['weight', 'reps', 'time', 'distance']::public.exercise_tracking_parameter[])
             )
             returning id`,
        exercise.id ? [exercise.id, ...exerciseValues(exercise)] : exerciseValues(exercise),
      );
      exerciseIds.set(exercise.name, idOf(inserted.rows[0]));
      counts.exercises.created += 1;
    }
  }

  for (const workout of document.workouts) {
    const existing = workout.id
      ? await sharedRowId(client, "workouts", "workout", workout.id, label)
      : (workoutIds.get(workout.name) ?? (await findSharedId(client, "workouts", workout.name)));
    const workoutId = existing
      ? existing
      : idOf(
          (
            await client.query(
              workout.id
                ? `insert into public.workouts (
                     id, trainer_id, owner_client_id, name, description, estimated_duration_minutes, is_template
                   ) values ($1, null, null, $2, $3, $4, $5)
                   returning id`
                : `insert into public.workouts (
                     trainer_id, owner_client_id, name, description, estimated_duration_minutes, is_template
                   ) values (null, null, $1, $2, $3, $4)
                   returning id`,
              workout.id
                ? [workout.id, workout.name, workout.description, workout.minutes, workout.isTemplate]
                : [workout.name, workout.description, workout.minutes, workout.isTemplate],
            )
          ).rows[0],
        );

    if (existing) {
      await client.query(
        `update public.workouts
         set name = $2, description = $3, estimated_duration_minutes = $4, is_template = $5
         where id = $1`,
        [workoutId, workout.name, workout.description, workout.minutes, workout.isTemplate],
      );
      counts.workouts.updated += 1;
    } else {
      counts.workouts.created += 1;
    }
    workoutIds.set(workout.name, workoutId);

    await client.query(`delete from public.workout_blocks where workout_id = $1`, [workoutId]);
    for (const block of workout.blocks) {
      const exerciseId = block.exerciseId ?? (block.exercise ? exerciseIds.get(block.exercise) : null);
      if ((block.exercise || block.exerciseId) && !exerciseId) {
        throw new CatalogError([`${label}: unknown exercise "${block.exercise ?? block.exerciseId}"`]);
      }
      await client.query(
        `insert into public.workout_blocks (
           workout_id, exercise_id, block_type, position, title,
           prescribed_sets, prescribed_reps_min, prescribed_reps_max,
           prescribed_load, load_unit, rest_seconds, tempo, rpe_target, instructions, configuration,
           prescribed_duration_seconds, prescribed_distance_meters, prescribed_height_cm,
           prescribed_heart_rate_bpm
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19)`,
        [
          workoutId,
          exerciseId,
          block.blockType,
          block.position,
          block.title,
          block.sets,
          block.repsMin,
          block.repsMax,
          block.load,
          block.loadUnit,
          block.restSeconds,
          block.tempo,
          block.rpeTarget,
          block.instructions,
          JSON.stringify(block.configuration),
          block.durationSeconds,
          block.distanceMeters,
          block.heightCm,
          block.heartRateBpm,
        ],
      );
    }
  }

  for (const program of document.programs) {
    const existing = await findSharedId(client, "programs", program.name);
    const programId = existing
      ? existing
      : idOf(
          (
            await client.query(
              `insert into public.programs (
                 trainer_id, owner_client_id, name, description, status, estimated_duration_weeks
               ) values (null, null, $1, $2, $3, $4)
               returning id`,
              [program.name, program.description, program.status, program.estimatedDurationWeeks],
            )
          ).rows[0],
        );

    if (existing) {
      await client.query(
        `update public.programs set description = $2, status = $3, estimated_duration_weeks = $4 where id = $1`,
        [programId, program.description, program.status, program.estimatedDurationWeeks],
      );
      counts.programs.updated += 1;
    } else {
      counts.programs.created += 1;
    }

    await client.query(`delete from public.program_phases where program_id = $1`, [programId]);
    for (const phase of program.phases) {
      const phaseId = idOf(
        (
          await client.query(
            `insert into public.program_phases (program_id, name, position, description)
             values ($1, $2, $3, $4)
             returning id`,
            [programId, phase.name, phase.position, phase.description],
          )
        ).rows[0],
      );

      for (const week of phase.weeks) {
        const weekId = idOf(
          (
            await client.query(
              `insert into public.program_weeks (program_phase_id, week_number, name, notes)
               values ($1, $2, $3, $4)
               returning id`,
              [phaseId, week.weekNumber, week.name, week.notes],
            )
          ).rows[0],
        );

        for (const day of week.days) {
          const workoutId = day.workoutId ?? (day.workoutName ? workoutIds.get(day.workoutName) : null);
          if (!workoutId) throw new CatalogError([`${label}: unknown workout "${day.workoutName ?? day.workoutId}"`]);
          await client.query(
            `insert into public.program_workouts (
               program_week_id, workout_id, day_number, position, title_override, notes
             ) values ($1, $2, $3, $4, $5, $6)`,
            [weekId, workoutId, day.day, day.position, day.titleOverride, day.notes],
          );
        }
      }
    }
  }

  return counts;
}

async function assertCatalogIds(client: SqlClient, table: string, label: string, referenced: string[], definedInFile: Set<string>, fileLabel: string) {
  const ids = [...new Set([...referenced, ...definedInFile])];
  const found = await findRowsById(client, table, ids);
  const issues: string[] = [];
  for (const id of ids) {
    const row = found.get(id);
    if (row && !row.shared) issues.push(`${fileLabel}: ${label} id ${id} is not in the shared catalog`);
    else if (!row && !definedInFile.has(id)) issues.push(`${fileLabel}: unknown ${label} id ${id}`);
  }
  if (issues.length > 0) throw new CatalogError(issues);
}

async function sharedRowId(client: SqlClient, table: string, label: string, id: string, fileLabel: string) {
  const found = await findRowsById(client, table, [id]);
  const row = found.get(id);
  if (!row) return null;
  if (!row.shared) throw new CatalogError([`${fileLabel}: ${label} id ${id} is not in the shared catalog`]);
  return id;
}

async function findRowsById(client: SqlClient, table: string, ids: string[]) {
  const found = new Map<string, { shared: boolean }>();
  if (ids.length === 0) return found;
  const rows = await client.query(
    `select id::text as id, (trainer_id is null and owner_client_id is null) as shared
     from public.${table}
     where id::text = any($1::text[])`,
    [ids],
  );
  for (const row of rows.rows) {
    found.set(idOf(row), { shared: row.shared === true });
  }
  return found;
}

async function resolveSharedIds(client: SqlClient, table: string, label: string, referenced: string[], definedInFile: Set<string>, fileLabel: string) {
  const needed = [...new Set(referenced.filter((name) => !definedInFile.has(name)))];
  const ids = await findSharedIds(client, table, needed);
  const missing = needed.filter((name) => !ids.has(name));
  if (missing.length > 0) {
    throw new CatalogError(missing.map((name) => `${fileLabel}: unknown ${label} "${name}"`));
  }
  return ids;
}

async function findSharedIds(client: SqlClient, table: string, names: string[]) {
  const ids = new Map<string, string>();
  if (names.length === 0) return ids;
  const found = await client.query(
    `select id, name from public.${table}
     where trainer_id is null and owner_client_id is null and name = any($1::text[])`,
    [names],
  );
  for (const row of found.rows) {
    const name = String(row.name);
    if (ids.has(name)) throw new CatalogError([`shared ${table} name "${name}" matches more than one row`]);
    ids.set(name, idOf(row));
  }
  return ids;
}

async function findSharedId(client: SqlClient, table: string, name: string) {
  const ids = await findSharedIds(client, table, [name]);
  return ids.get(name) ?? null;
}

function exerciseValues(exercise: CatalogExercise) {
  return [
    exercise.name,
    exercise.description,
    exercise.instructions,
    exercise.muscle,
    exercise.equipment,
    exercise.videoUrl,
    enumArray(exercise.secondaryMuscleGroups),
    enumArray(exercise.bodyParts),
    exercise.trackingType,
    exercise.trackingParameters ? `{${exercise.trackingParameters.join(",")}}` : null,
  ];
}

function enumArray(values: readonly string[]) {
  return `{${values.join(",")}}`;
}

function idOf(row: Record<string, unknown> | undefined) {
  const id = row?.id;
  if (typeof id !== "string" || id.length === 0) throw new CatalogError(["database did not return an id"]);
  return id;
}
