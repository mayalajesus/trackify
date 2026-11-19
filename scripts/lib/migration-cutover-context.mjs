import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import pg from "pg";
import { sealArchive, openArchive } from "./migration-archive.mjs";
import { validateConnection } from "./supabase-migration-audit.mjs";

export const sourceRef = "qgqwvyprivwvffuewzmp";
export const targetRef = "gfedmrhckghmgssgfwis";
export const projectId = "prj_XsV3x76RO8bbiJqkKJA5HCan6ISz";
export const teamId = "team_X9Kl93Zf0PUA2aNUk0zNmhNU";
export const origin = "https://watchtag.vercel.app";
export const folder = "backup/migration-preparation";

export async function cutoverContext() {
  const root = parseEnv(await readFile(".env", "utf8"));
  const migration = parseEnv(await readFile(".env.migration.local", "utf8"));
  const backup = parseEnv(await readFile(".env.backup.local", "utf8"));
  const ca = await readFile(`${folder}/supabase-ca.crt`, "utf8");
  const preserve = async (name, value, ref = targetRef) =>
    writeFile(
      `${folder}/${name}.enc`,
      sealArchive(Buffer.from(JSON.stringify(value)), backup.BACKUP_ENCRYPTION_PASSPHRASE, ref),
      { flag: "wx", mode: 0o600 },
    );
  const recover = async (name, ref = targetRef) =>
    JSON.parse(
      openArchive(await readFile(`${folder}/${name}.enc`), backup.BACKUP_ENCRYPTION_PASSPHRASE, ref)
        .plaintext,
    );
  const evidence = async (name, value) =>
    writeFile(`${folder}/${name}.json`, JSON.stringify(value, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  const db = async (side) => {
    assert.ok(["source", "target"].includes(side));
    const connection = validateConnection(
      side === "source"
        ? root.SUPABASE_DATABASE_URL
        : migration.MIGRATION_TARGET_DATABASE_URL_DIRECT,
      side === "source" ? sourceRef : targetRef,
    );
    const client = new pg.Client({
      connectionString: connection,
      ssl: { rejectUnauthorized: true, ca },
      connectionTimeoutMillis: 30000,
      query_timeout: 120000,
    });
    await client.connect();
    return client;
  };
  const request = async (url, token, method = "GET", body, expected = [200, 201, 202, 204]) => {
    const r = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    });
    const result = r.status === 204 ? null : await r.json().catch(() => null);
    if (!expected.includes(r.status)) {
      await preserve(`cutover-api-error-${Date.now()}`, { url, method, status: r.status, result });
      throw Error(`Management API HTTP ${r.status}`);
    }
    return result;
  };
  const vercel = (method, endpoint, body, expected) =>
    request(
      `https://api.vercel.com${endpoint}${endpoint.includes("?") ? "&" : "?"}teamId=${teamId}`,
      root.VERCEL_TOKEN,
      method,
      body,
      expected,
    );
  const supabase = (method, endpoint, body) =>
    request(
      `https://api.supabase.com/v1/projects/${targetRef}${endpoint}`,
      migration.MIGRATION_TARGET_ACCESS_TOKEN,
      method,
      body,
    );
  return { root, migration, backup, db, preserve, recover, evidence, vercel, supabase };
}
