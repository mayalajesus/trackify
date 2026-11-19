import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import pg from "pg";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";
import { readManagedSchema, managedSchemaSql } from "./lib/backup-managed-schema.mjs";

let client;
try {
  const url = new URL(process.env.SUPABASE_URL);
  if (!/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(url.href))
    throw Error("Invalid source identity.");
  const projectRef = url.hostname.split(".")[0];
  client = new pg.Client({
    connectionString: validateConnection(process.env.SUPABASE_DB_URL, projectRef),
    ssl: { ca: await readFile("server/certs/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
    connectionTimeoutMillis: 30000,
    query_timeout: 30000,
    options: "-c default_transaction_read_only=on",
  });
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '30s'");
  const catalog = await readManagedSchema(client);
  const sql = managedSchemaSql(catalog);
  await client.query("ROLLBACK");
  const root = resolve(process.argv[2] || "backup/database");
  if (process.argv.includes("--verify")) {
    const saved = JSON.parse(await readFile(join(root, "managed-schema.json"), "utf8"));
    assert.equal(saved.projectRef, projectRef);
    assert.deepEqual(saved.catalog, catalog, "Managed customizations changed during backup.");
    assert.equal(await readFile(join(root, "managed-schema.sql"), "utf8"), sql);
  } else {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "managed-schema.sql"), sql, { flag: "wx", mode: 0o600 });
    await writeFile(
      join(root, "managed-schema.json"),
      JSON.stringify(
        { format: 1, projectRef, capturedAt: new Date().toISOString(), catalog },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  console.log(
    `Backed up ${catalog.triggers.length} managed-schema triggers and ${catalog.policies.length} policies.`,
  );
} catch {
  console.error(
    "Managed schema backup failed; source identity, TLS, read-only access and required customizations must be valid. Sensitive diagnostics suppressed.",
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
