import type { CatalogDocument } from "./document";
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
    document.programs.flatMap((program) => program.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.days.map((day) => day.workout)))),
    new Set(document.workouts.map((workout) => workout.name)),
    label,
  );

  for (const exercise of document.exercises) {
    const existing = exerciseIds.get(exercise.name) ?? (await findSharedId(client, "exercises", exercise.name));
    if (existing) {
      await client.query(
        `update public.exercises
         set description = $2,
             instructions = $3,
             primary_muscle_group = $4,
             equipment = $5,
             video_url = $6
         where id = $1`,
        [existing, exercise.description, exercise.instructions, exercise.muscle, exercise.equipment, exercise.videoUrl],
      );
      exerciseIds.set(exercise.name, existing);
      counts.exercises.updated += 1;
    } else {
      const inserted = await client.query(
        `insert into public.exercises (
           trainer_id, owner_client_id, name, description, instructions, primary_muscle_group, equipment, video_url
         ) values (null, null, $1, $2, $3, $4, $5, $6)
         returning id`,
        [exercise.name, exercise.description, exercise.instructions, exercise.muscle, exercise.equipment, exercise.videoUrl],
      );
      exerciseIds.set(exercise.name, idOf(inserted.rows[0]));
      counts.exercises.created += 1;
    }
  }

  for (const workout of document.workouts) {
    const existing = workoutIds.get(workout.name) ?? (await findSharedId(client, "workouts", workout.name));
    const workoutId = existing
      ? existing
      : idOf(
          (
            await client.query(
              `insert into public.workouts (
                 trainer_id, owner_client_id, name, description, estimated_duration_minutes, is_template
               ) values (null, null, $1, $2, $3, true)
               returning id`,
              [workout.name, workout.description, workout.minutes],
            )
          ).rows[0],
        );

    if (existing) {
      await client.query(
        `update public.workouts
         set description = $2, estimated_duration_minutes = $3, is_template = true
         where id = $1`,
        [workoutId, workout.description, workout.minutes],
      );
      counts.workouts.updated += 1;
    } else {
      counts.workouts.created += 1;
    }
    workoutIds.set(workout.name, workoutId);

    await client.query(`delete from public.workout_blocks where workout_id = $1`, [workoutId]);
    for (const [index, block] of workout.blocks.entries()) {
      const exerciseId = block.exercise ? exerciseIds.get(block.exercise) : null;
      if (block.exercise && !exerciseId) {
        throw new CatalogError([`${label}: unknown exercise "${block.exercise}"`]);
      }
      await client.query(
        `insert into public.workout_blocks (
           workout_id, exercise_id, block_type, position, title,
           prescribed_sets, prescribed_reps_min, prescribed_reps_max,
           prescribed_load, load_unit, rest_seconds
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          workoutId,
          exerciseId,
          block.blockType,
          index + 1,
          block.title,
          block.sets,
          block.repsMin,
          block.repsMax,
          block.load,
          block.loadUnit,
          block.restSeconds,
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
                 trainer_id, owner_client_id, name, description, status
               ) values (null, null, $1, $2, $3)
               returning id`,
              [program.name, program.description, program.status],
            )
          ).rows[0],
        );

    if (existing) {
      await client.query(
        `update public.programs set description = $2, status = $3 where id = $1`,
        [programId, program.description, program.status],
      );
      counts.programs.updated += 1;
    } else {
      counts.programs.created += 1;
    }

    await client.query(`delete from public.program_phases where program_id = $1`, [programId]);
    for (const [phaseIndex, phase] of program.phases.entries()) {
      const phaseId = idOf(
        (
          await client.query(
            `insert into public.program_phases (program_id, name, position, description)
             values ($1, $2, $3, $4)
             returning id`,
            [programId, phase.name, phaseIndex + 1, phase.description],
          )
        ).rows[0],
      );

      for (const [weekIndex, week] of phase.weeks.entries()) {
        const weekId = idOf(
          (
            await client.query(
              `insert into public.program_weeks (program_phase_id, week_number, name)
               values ($1, $2, $3)
               returning id`,
              [phaseId, weekIndex + 1, week.name],
            )
          ).rows[0],
        );

        for (const day of week.days) {
          const workoutId = workoutIds.get(day.workout);
          if (!workoutId) throw new CatalogError([`${label}: unknown workout "${day.workout}"`]);
          await client.query(
            `insert into public.program_workouts (program_week_id, workout_id, day_number, position)
             values ($1, $2, $3, $4)`,
            [weekId, workoutId, day.day, day.position],
          );
        }
      }
    }
  }

  return counts;
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

function idOf(row: Record<string, unknown> | undefined) {
  const id = row?.id;
  if (typeof id !== "string" || id.length === 0) throw new CatalogError(["database did not return an id"]);
  return id;
}
