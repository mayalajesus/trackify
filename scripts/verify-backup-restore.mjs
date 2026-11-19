import assert from "node:assert/strict";
import { readFile, appendFile } from "node:fs/promises";
import { resolve, sep, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import {
  LOCAL_RESTORE_URL,
  assertLocalRestoreUrl,
  readManagedSchema,
  managedSchemaSql,
  copyTableCounts,
} from "./lib/backup-managed-schema.mjs";
import { quoteIdentifier as ident } from "./lib/supabase-migration-audit.mjs";
import { probeRestoredAccess } from "./lib/backup-restore-probes.mjs";

let phase = "validate-input",
  db;
try {
  const root = resolve(process.argv[2]);
  const manifest = JSON.parse(await readFile(join(root, "database/managed-schema.json"), "utf8"));
  assert.equal(manifest.format, 1);
  const managedSql = await readFile(join(root, "database/managed-schema.sql"), "utf8");
  assert.equal(
    managedSql,
    managedSchemaSql(manifest.catalog),
    "SQL and managed-schema inventory disagree.",
  );
  const expected = copyTableCounts(await readFile(join(root, "database/data.sql"), "utf8"));
  db = new pg.Client({
    connectionString: assertLocalRestoreUrl(LOCAL_RESTORE_URL),
    connectionTimeoutMillis: 10000,
    query_timeout: 60000,
  });
  await db.connect();
  phase = "require-empty-local-database";
  const target = (
    await db.query(
      "select current_user as role,current_database() as name,to_regclass('public.profiles') as profiles,(select count(*)::int from auth.users) as users,(select count(*)::int from storage.objects) as objects",
    )
  ).rows[0];
  assert.deepEqual(
    target,
    { role: "supabase_admin", name: "postgres", profiles: null, users: 0, objects: 0 },
    "Rehearsal requires an empty disposable database.",
  );
  phase = "restore-local-transaction";
  // Never pass production connection variables, PGOPTIONS or service files to psql.
  const restored = spawnSync(
    "psql",
    [
      "-X",
      LOCAL_RESTORE_URL,
      "--single-transaction",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      join(root, "database/roles.sql"),
      "-f",
      join(root, "database/schema.sql"),
      "-c",
      "SET session_replication_role = replica",
      "-f",
      join(root, "database/data.sql"),
      "-f",
      join(root, "database/managed-schema.sql"),
      "-c",
      "SET session_replication_role = origin",
    ],
    {
      env: {
        PATH: process.env.PATH,
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      },
      timeout: 180000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    },
  );
  // COPY/SQL errors may contain personal data: never print command diagnostics.
  assert.equal(
    restored.status,
    0,
    "Local restore transaction failed; sensitive diagnostics suppressed.",
  );
  phase = "verify-restored-data-and-catalog";
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    for (const t of expected) {
      const actual = (
        await db.query(`select count(*)::int as n from ${ident(t.schema)}.${ident(t.table)}`)
      ).rows[0].n;
      assert.equal(actual, t.count, `Restored row count differs: ${t.schema}.${t.table}`);
    }
    assert.deepEqual(
      await readManagedSchema(db),
      manifest.catalog,
      "Restored triggers, policy expressions/roles or row-security flags differ.",
    );
    const invalid = (
      await db.query(
        `select count(*)::int n from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and not i.indisvalid`,
      )
    ).rows[0].n;
    assert.equal(invalid, 0);
  } finally {
    await db.query("ROLLBACK");
  }
  phase = "exercise-auth-triggers-and-storage-permissions";
  const behavior = await probeRestoredAccess(db);
  phase = "restore-private-files-locally";
  // Local CLI status supplies local credentials. Never fall back to hosted Storage env vars.
  const status = spawnSync("supabase", ["status", "--workdir", process.argv[3], "-o", "json"], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  assert.equal(status.status, 0, "Local Supabase status unavailable.");
  const local = JSON.parse(status.stdout);
  assert.ok(["http://127.0.0.1:54321", "http://localhost:54321"].includes(local.API_URL));
  assert.ok(
    local.SERVICE_ROLE_KEY && local.SERVICE_ROLE_KEY !== process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const storage = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
  const objects = JSON.parse(await readFile(join(root, "storage/manifest.json"), "utf8"));
  assert.equal(
    objects.length,
    expected.find((t) => t.schema === "storage" && t.table === "objects").count,
  );
  const seen = new Set();
  for (const object of objects) {
    assert.ok(["avatars", "workspace-logos"].includes(object.bucket));
    assert.ok(
      typeof object.path === "string" &&
        !object.path.includes("\\") &&
        !object.path.split("/").includes(".."),
    );
    const filename = resolve(root, "storage", object.bucket, object.path);
    assert.ok(filename.startsWith(resolve(root, "storage", object.bucket) + sep));
    assert.ok(!seen.has(filename));
    seen.add(filename);
    const bytes = await readFile(filename);
    assert.equal(bytes.length, object.bytes);
    const digest = (value) => createHash("sha256").update(value).digest("hex");
    assert.equal(digest(bytes), object.sha256);
    const row = (
      await db.query("select metadata from storage.objects where bucket_id=$1 and name=$2", [
        object.bucket,
        object.path,
      ])
    ).rows[0];
    assert.ok(row, "Storage metadata missing from restored database.");
    const bucket = await storage.getBucket(object.bucket);
    assert.ok(!bucket.error && bucket.data.public === false, "Restored bucket must be private.");
    const uploaded = await storage.from(object.bucket).upload(object.path, bytes, {
      upsert: true,
      contentType: row.metadata?.mimetype || "application/octet-stream",
    });
    assert.ok(!uploaded.error, "Local Storage upload failed.");
    const downloaded = await storage.from(object.bucket).download(object.path);
    assert.ok(!downloaded.error, "Local Storage download failed.");
    assert.equal(digest(Buffer.from(await downloaded.data.arrayBuffer())), object.sha256);
  }
  const result = {
    status: "passed",
    tables: expected.length,
    authUsers: expected.find((t) => t.schema === "auth" && t.table === "users").count,
    triggers: manifest.catalog.triggers.length,
    policies: manifest.catalog.policies.length,
    privateFilesRestoredAndVerified: objects.length,
    behavior,
    productionWrites: false,
  };
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Full isolated restore passed: ${result.tables} tables, ${result.authUsers} Auth users, ${result.triggers} triggers, ${result.policies} policies, ${objects.length} private files. Auth trigger and image authorization probes passed; production was read-only.\n`,
    );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      phase,
      code: error.code ?? "RESTORE_VERIFICATION_FAILED",
      message:
        error instanceof assert.AssertionError
          ? error.message.split("\n")[0]
          : "Sensitive diagnostics suppressed.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
