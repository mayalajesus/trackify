import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { collectAudit, validateConnection } from "./lib/supabase-migration-audit.mjs";

async function main() {
  loadEnvFile(".env.migration.local");
  loadEnvFile(".env.backup.local");
  const source = process.argv.includes("--source");
  const projectRef = source ? "qgqwvyprivwvffuewzmp" : "gfedmrhckghmgssgfwis";
  const sourceEnv = source ? parseEnv(await readFile(".env", "utf8")) : {};
  const connectionString = source
    ? sourceEnv.SUPABASE_DATABASE_URL
    : process.env.MIGRATION_TARGET_DATABASE_URL_DIRECT;
  const stem = process.argv[2];
  if (!stem || !path.resolve(stem).startsWith(path.resolve("backup") + path.sep))
    throw Error("Ignored output path required");
  const caFile = path.resolve("backup/migration-preparation/supabase-ca.crt");
  const options = {
    connectionString: validateConnection(connectionString, projectRef),
    ssl: { rejectUnauthorized: true, ca: await readFile(caFile, "utf8") },
    connectionTimeoutMillis: 60000,
    query_timeout: 120000,
  };
  const exporter = new pg.Client(options),
    auditor = new pg.Client(options);
  try {
    await exporter.connect();
    await auditor.connect();
    await exporter.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (await exporter.query("select pg_export_snapshot() as snapshot")).rows[0]
      .snapshot;
    const dump = new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "scripts/supabase-migration-backup.mjs",
          "--project-ref",
          projectRef,
          "--output",
          stem + ".dump.enc",
          "--snapshot",
          snapshot,
          ...(new URL(connectionString).hostname === `db.${projectRef}.supabase.co`
            ? ["--direct-bridge"]
            : []),
        ],
        {
          env: {
            ...process.env,
            MIGRATION_SOURCE_DATABASE_URL: validateConnection(connectionString, projectRef),
            MIGRATION_SOURCE_CA_FILE: caFile,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout.resume();
      child.stderr.resume();
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(Error("Backup process failed")),
      );
    });
    const results = await Promise.allSettled([
      collectAudit(auditor, projectRef, { snapshot }),
      dump,
    ]);
    if (results.some((r) => r.status !== "fulfilled"))
      throw Error("Matching backup/audit did not finish");
    await writeFile(stem + ".audit.json", JSON.stringify(results[0].value, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    const manifest = JSON.parse(await readFile(stem + ".dump.enc.json"));
    if (manifest.exportedSnapshot !== snapshot) throw Error("Backup snapshot differs");
    const evidence = {
      projectRef,
      completedAt: new Date().toISOString(),
      sameExportedSnapshot: true,
      sharedSnapshot: snapshot,
      tables: Object.keys(results[0].value.tables).length,
      archiveEncrypted: true,
      productionChanged: false,
      storageBytesBackedUpSeparately: true,
    };
    await writeFile(stem + ".consistency.json", JSON.stringify(evidence, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(JSON.stringify(evidence));
  } finally {
    await exporter.query("ROLLBACK").catch(() => {});
    await exporter.end();
    await auditor.end();
  }
}
main().catch(() => {
  console.error("Consistent backup verification failed; no production changes requested.");
  process.exitCode = 1;
});
