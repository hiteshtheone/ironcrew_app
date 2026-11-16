import { pathToFileURL } from "node:url";

import pg from "pg";

export type SqlClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type PurgeCounts = {
  exerciseResults: number;
  workoutAssignments: number;
  programSlots: number;
  workoutBlocks: number;
  programs: number;
  workouts: number;
  exercises: number;
  keptWorkouts: number;
  keptExercises: number;
};

function systemOwner(alias?: string) {
  const trainer = alias ? `${alias}.trainer_id` : "trainer_id";
  const owner = alias ? `${alias}.owner_client_id` : "owner_client_id";
  return `${trainer} is null and ${owner} is null`;
}

export async function purgeSystemCatalog(client: SqlClient): Promise<PurgeCounts> {
  const exerciseResults = await deleted(client, `
    delete from public.exercise_results as result
    where result.exercise_id in (
      select exercise.id from public.exercises as exercise where ${systemOwner("exercise")}
    )
      and not exists (
        select 1
        from public.workout_sessions as session
        join public.workouts as workout on workout.id = session.workout_id
        where session.id = result.workout_session_id
          and ${systemOwner("workout")}
      )
    returning result.id
  `);

  const workoutAssignments = await deleted(client, `
    delete from public.workout_assignments as assignment
    where assignment.workout_id in (
      select workout.id from public.workouts as workout where ${systemOwner("workout")}
    )
    returning assignment.id
  `);

  const programSlots = await deleted(client, `
    delete from public.program_workouts as slot
    where slot.workout_id in (
      select workout.id from public.workouts as workout where ${systemOwner("workout")}
    )
    returning slot.id
  `);

  const workoutBlocks = await deleted(client, `
    delete from public.workout_blocks as block
    where block.exercise_id in (
      select exercise.id from public.exercises as exercise where ${systemOwner("exercise")}
    )
      and not exists (
        select 1
        from public.exercise_results as result
        join public.workout_sessions as session on session.id = result.workout_session_id
        join public.workouts as workout on workout.id = session.workout_id
        where result.workout_block_id = block.id
          and ${systemOwner("workout")}
      )
    returning block.id
  `);

  const programs = await deleted(client, `
    delete from public.programs
    where ${systemOwner()}
    returning id
  `);

  const workouts = await deleted(client, `
    delete from public.workouts as workout
    where ${systemOwner("workout")}
      and not exists (
        select 1 from public.workout_sessions as session where session.workout_id = workout.id
      )
    returning workout.id
  `);

  const exercises = await deleted(client, `
    delete from public.exercises as exercise
    where ${systemOwner("exercise")}
      and not exists (
        select 1 from public.exercise_results as result where result.exercise_id = exercise.id
      )
    returning exercise.id
  `);

  return {
    exerciseResults,
    workoutAssignments,
    programSlots,
    workoutBlocks,
    programs,
    workouts,
    exercises,
    keptWorkouts: await counted(client, `
      select count(*)::int as count
      from public.workouts as workout
      where ${systemOwner("workout")}
        and exists (
          select 1 from public.workout_sessions as session where session.workout_id = workout.id
        )
    `),
    keptExercises: await counted(client, `
      select count(*)::int as count
      from public.exercises as exercise
      where ${systemOwner("exercise")}
        and exists (
          select 1
          from public.exercise_results as result
          join public.workout_sessions as session on session.id = result.workout_session_id
          join public.workouts as workout on workout.id = session.workout_id
          where result.exercise_id = exercise.id
            and ${systemOwner("workout")}
        )
    `),
  };
}

async function deleted(client: SqlClient, statement: string) {
  const result = await client.query(statement);
  return result.rows.length;
}

async function counted(client: SqlClient, statement: string) {
  const result = await client.query(statement);
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    console.error("Usage: purge-system-catalog [--apply]");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required to purge the system catalog.");
    process.exit(1);
  }

  const apply = args[0] === "--apply";
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    try {
      const counts = await purgeSystemCatalog(client);
      if (apply) await client.query("commit");
      else await client.query("rollback");
      console.log(formatCounts(counts, apply));
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.end();
  }
}

function formatCounts(counts: PurgeCounts, apply: boolean) {
  const lines = [
    apply ? "Deleted system catalog rows." : "Dry run. Rolled back.",
    `  exercise results: ${counts.exerciseResults} deleted`,
    `  workout assignments: ${counts.workoutAssignments} deleted`,
    `  program slots: ${counts.programSlots} deleted`,
    `  workout blocks: ${counts.workoutBlocks} deleted`,
    `  programs: ${counts.programs} deleted`,
    `  workouts: ${counts.workouts} deleted`,
    `  exercises: ${counts.exercises} deleted`,
    `  system workouts kept: ${counts.keptWorkouts}`,
    `  system exercises kept: ${counts.keptExercises}`,
  ];
  return lines.join("\n");
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Purge failed");
    process.exit(1);
  });
}
