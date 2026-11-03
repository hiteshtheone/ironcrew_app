import { resolve } from "node:path";

import pg from "pg";

import { applyDocument, type ApplyCounts } from "./catalog/apply";
import { CatalogError, catalogFiles, readCatalog } from "./catalog/document";

async function main() {
  const [command, target, extra] = process.argv.slice(2);
  if ((command !== "validate" && command !== "apply") || !target || extra) {
    console.error("Usage: catalog <validate|apply> <file-or-directory>");
    process.exit(1);
  }

  const files = catalogFiles(resolve(target));
  const documents = files.map((file) => ({ file, document: readCatalog(file) }));

  if (command === "validate") {
    console.log(`Validated ${documents.length} file${documents.length === 1 ? "" : "s"}.`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required to apply a catalog.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const { file, document } of documents) {
      await client.query("begin");
      try {
        const counts = await applyDocument(client, document, file);
        await client.query("commit");
        console.log(formatCounts(file, counts));
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

function formatCounts(file: string, counts: ApplyCounts) {
  const line = (label: string, rows: ApplyCounts["exercises"]) =>
    `  ${label}: ${rows.created} created, ${rows.updated} updated`;
  return [file, line("exercises", counts.exercises), line("workouts", counts.workouts), line("programs", counts.programs)].join("\n");
}

main().catch((error: unknown) => {
  console.error(explain(error));
  process.exit(1);
});

function explain(error: unknown) {
  const message = error instanceof Error ? error.message : "Catalog command failed";
  if (message.includes("programs_single_owner") || message.includes("workouts_single_owner")) {
    return `${message}\nShared programs and workouts need migration 000009_system_library.`;
  }
  if (error instanceof CatalogError) return message;
  return message;
}
