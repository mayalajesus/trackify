import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { validateConnection, quoteIdentifier } from "./supabase-migration-audit.mjs";
import { sealArchive } from "./migration-archive.mjs";
import { assertMigrationCandidate } from "./migration-project-status.mjs";

export const targetRef = "gfedmrhckghmgssgfwis";
export async function migrationContext() {
  assertMigrationCandidate(targetRef);
  const migration = parseEnv(await readFile(".env.migration.local", "utf8"));
  assert.notEqual(
    migration.MIGRATION_TARGET_IS_PRODUCTION,
    "true",
    "Candidate is now production; migration test fixtures are disabled",
  );
  const backup = parseEnv(await readFile(".env.backup.local", "utf8"));
  const connection = new URL(
    validateConnection(migration.MIGRATION_TARGET_DATABASE_URL_DIRECT, targetRef),
  );
  connection.searchParams.set("sslmode", "verify-full");
  connection.searchParams.set(
    "sslrootcert",
    path.resolve("backup/migration-preparation/supabase-ca.crt"),
  );
  const response = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/api-keys`, {
    headers: { Authorization: `Bearer ${migration.MIGRATION_TARGET_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200);
  const keys = await response.json();
  const key = (role) => {
    const value = keys.find((item) => item.name === role)?.api_key;
    const claims = JSON.parse(Buffer.from(value?.split(".")[1] ?? "", "base64url"));
    assert.equal(claims.ref, targetRef);
    assert.equal(claims.role, role);
    return value;
  };
  const url = `https://${targetRef}.supabase.co`;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const env = {
    DATABASE_ENV: "migration",
    DATABASE_PROVIDER: "supabase",
    DATABASE_URL: connection.href,
    SUPABASE_DATABASE_URL: connection.href,
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: key("anon"),
    SUPABASE_SERVICE_ROLE_KEY: key("service_role"),
    MIGRATION_TEST_PROJECT: targetRef,
    MAILJET_ENABLED: "false",
    SENTRY_DSN: "",
    APP_URL: "http://localhost:5189",
    TRACKIFY_EXTENSION_IDS: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const db = new pg.Client({
    connectionString: connection.href,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });
  await db.connect();
  return {
    db,
    env,
    migration,
    url,
    admin: createClient(url, key("service_role"), options),
    auth: () => createClient(url, key("anon"), options),
    preserve: async (file, value) =>
      writeFile(
        file,
        sealArchive(
          Buffer.from(JSON.stringify(value)),
          backup.BACKUP_ENCRYPTION_PASSPHRASE,
          targetRef,
        ),
        { flag: "wx", mode: 0o600 },
      ),
  };
}

// Full public records, except request counters which the open candidate updates.
// Auth sessions legitimately refresh; stable account/password fields are checked separately.
export async function businessFingerprint(db) {
  const names = (
    await db.query(
      "select tablename from pg_tables where schemaname='public' and tablename<>'api_rate_limits' order by tablename",
    )
  ).rows.map((r) => r.tablename);
  const selects = names.map(
    (name) =>
      `select '${name}' as name,count(*)::int as count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') as hash from public.${quoteIdentifier(name)} t`,
  );
  selects.push(
    "select 'auth_accounts',count(*)::int,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') from (select id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data from auth.users) t",
  );
  for (const name of ["buckets", "objects"])
    selects.push(
      `select 'storage.${name}',count(*)::int,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') from storage.${quoteIdentifier(name)} t`,
    );
  return (await db.query(selects.join(" UNION ALL "))).rows;
}

export async function verifyPreserved(db, before) {
  const after = await businessFingerprint(db);
  const differences = [
    ...new Set([...before.map((r) => r.name), ...after.map((r) => r.name)]),
  ].filter(
    (name) =>
      JSON.stringify(before.find((r) => r.name === name)) !==
      JSON.stringify(after.find((r) => r.name === name)),
  );
  assert.deepEqual(differences, [], "Existing business/account data changed");
  return { tables: after.length, unchanged: true };
}
