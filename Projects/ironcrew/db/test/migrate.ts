import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const authStub = `
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
`;

/** In-memory database with the real migrations applied, plus a stand-in for Supabase auth. */
export async function migrateDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(authStub);
  await db.exec("create role authenticated");
  await db.exec("create role anon");

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".up.sql"))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}: ${message}`);
    }
  }

  await db.exec(`
    grant usage on schema public to authenticated;
    grant all privileges on all tables in schema public to authenticated;
    grant all privileges on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant select, delete on auth.users to authenticated;
  `);

  return db;
}

/** Runs `run` in a transaction that always rolls back. Call `become` before statements that must see RLS. */
export async function scenario<T>(db: PGlite, run: () => Promise<T>) {
  await db.exec("begin");
  try {
    return await run();
  } finally {
    await db.exec("rollback");
  }
}

export async function become(db: PGlite, userId: string) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', true)`);
  await db.exec("set local role authenticated");
}
