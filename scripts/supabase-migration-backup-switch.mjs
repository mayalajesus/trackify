import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cutoverContext, targetRef } from "./lib/migration-cutover-context.mjs";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";

const c = await cutoverContext();
const credentials = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
});
const token = credentials
  .split(/\r?\n/)
  .find((line) => line.startsWith("password="))
  ?.slice(9);
assert.ok(token);
function gh(args, input) {
  return execFileSync("backup/tools/gh/bin/gh.exe", [...args, "--repo", "mayalajesus/trackify"], {
    input,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, GH_TOKEN: token },
    stdio: ["pipe", "pipe", "pipe"],
  });
}
async function main() {
  if (process.argv[2] === "configure") {
    const keys = await c.supabase("GET", "/api-keys");
    const service = keys.find((k) => k.name === "service_role")?.api_key;
    assert.equal(JSON.parse(Buffer.from(service.split(".")[1], "base64url")).ref, targetRef);
    const db = new URL(validateConnection(c.migration.MIGRATION_TARGET_DATABASE_URL, targetRef));
    // The Supabase CLI creates its own pg_dump container. Keep session mode,
    // require TLS, and do not reference a host-only certificate path in its URL.
    db.searchParams.set("sslmode", "require");
    await c.preserve("cutover-backup-secrets-before", {
      SUPABASE_DB_URL: c.root.SUPABASE_DATABASE_URL,
      SUPABASE_URL: c.root.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: c.root.SUPABASE_SERVICE_ROLE_KEY,
    });
    for (const [key, value] of Object.entries({
      SUPABASE_DB_URL: db.href,
      SUPABASE_URL: `https://${targetRef}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: service,
    }))
      gh(["secret", "set", key], value);
    const startedAt = new Date().toISOString();
    gh(["workflow", "run", "production-backup.yml", "--ref", "main"]);
    await c.evidence("cutover-backup-dispatched", {
      targetRef,
      startedAt,
      passphrasePreserved: true,
    });
    console.log(JSON.stringify({ phase: "backup-dispatched", targetRef, startedAt }));
  } else if (process.argv[2] === "status") {
    const runs = JSON.parse(
      gh([
        "run",
        "list",
        "--workflow",
        "production-backup.yml",
        "--limit",
        "3",
        "--json",
        "databaseId,status,conclusion,createdAt,url",
      ]),
    );
    console.log(JSON.stringify(runs));
  } else if (process.argv[2] === "result") {
    const id = process.argv[3];
    assert.match(id ?? "", /^\d+$/);
    const result = JSON.parse(
      gh(["run", "view", id, "--json", "status,conclusion,jobs,url,createdAt"]),
    );
    await c.evidence(`cutover-backup-run-${id}`, result);
    console.log(
      JSON.stringify({
        id,
        status: result.status,
        conclusion: result.conclusion,
        url: result.url,
        jobs: result.jobs.map((j) => ({
          name: j.name,
          conclusion: j.conclusion,
          steps: j.steps.map((s) => ({ name: s.name, conclusion: s.conclusion })),
        })),
      }),
    );
  } else throw Error("Unknown command");
}
main().catch(() => {
  console.error("Backup switch failed; credentials and command diagnostics suppressed.");
  process.exitCode = 1;
});
