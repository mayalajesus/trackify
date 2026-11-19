import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  collectAudit,
  compareAudits,
  validateConnection,
} from "./lib/supabase-migration-audit.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const mode = process.argv[2];
  if (mode === "compare") {
    const source = JSON.parse(await readFile(argument("source"), "utf8"));
    const target = JSON.parse(await readFile(argument("target"), "utf8"));
    const comparison = compareAudits(source, target);
    console.log(JSON.stringify(comparison, null, 2));
    if (comparison.databaseParity !== "matched") process.exitCode = 2;
    return;
  }
  if (mode !== "capture" || !["source", "target"].includes(argument("side"))) {
    throw new Error(
      "Usage: capture --side source|target --project-ref REF --output backup/FILE.json; or compare --source FILE --target FILE",
    );
  }
  const side = argument("side");
  const projectRef = argument("project-ref");
  const connectionString = validateConnection(
    process.env[`MIGRATION_${side.toUpperCase()}_DATABASE_URL`],
    projectRef,
  );
  const output = path.resolve(argument("output") ?? "");
  const backupRoot = path.resolve("backup") + path.sep;
  if (!output.startsWith(backupRoot) || !output.endsWith(".json")) {
    throw new Error("Store audit evidence in an ignored backup/*.json file.");
  }
  const client = new pg.Client({
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ...(process.env[`MIGRATION_${side.toUpperCase()}_CA_FILE`]
        ? { ca: await readFile(process.env[`MIGRATION_${side.toUpperCase()}_CA_FILE`], "utf8") }
        : {}),
    },
    // Audit runs can cross regions; server-side statement_timeout still limits query work.
    connectionTimeoutMillis: 60_000,
    query_timeout: 120_000,
    application_name: "trackify-readonly-migration-audit",
  });
  try {
    await client.connect();
    const audit = await collectAudit(client, projectRef);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(audit, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({
        side,
        projectRef,
        tables: Object.keys(audit.tables).length,
        capturedAt: audit.capturedAt,
        output,
        productionCutoverAuthorized: false,
      }),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Database/URL errors may contain credentials or record contents. Never echo them.
  console.error(
    JSON.stringify({
      error: "Migration audit failed; no database changes were requested.",
      code: /^[A-Z0-9_]{2,40}$/.test(error?.code ?? "") ? error.code : "AUDIT_FAILED",
      stage: /^[a-zA-Z0-9_.:-]{1,120}$/.test(error?.auditStage ?? "")
        ? error.auditStage
        : "connection-or-local-file",
    }),
  );
  process.exitCode = 1;
});
