import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";
import { assertMigrationCandidate } from "./lib/migration-project-status.mjs";

// Private local candidate only. No production variables or deployment are changed.
async function main() {
  loadEnvFile(".env.migration.local");
  if (process.env.MIGRATION_TARGET_IS_PRODUCTION === "true")
    throw new Error("Candidate is now production; the local migration server is disabled.");
  const targetRef = "gfedmrhckghmgssgfwis";
  assertMigrationCandidate(targetRef);
  const connection = new URL(
    validateConnection(process.env.MIGRATION_TARGET_DATABASE_URL_DIRECT, targetRef),
  );
  connection.searchParams.set("sslmode", "verify-full");
  connection.searchParams.set(
    "sslrootcert",
    path.resolve("backup/migration-preparation/supabase-ca.crt"),
  );
  const evidenceIndex = process.argv.indexOf("--auth-evidence");
  const evidence = JSON.parse(
    await readFile(
      evidenceIndex < 0
        ? "backup/migration-preparation/target-auth-local-20261119.json"
        : process.argv[evidenceIndex + 1],
    ),
  );
  if (evidence.targetRef !== targetRef || !evidence.configVerified)
    throw new Error("Verified local Auth required.");
  const result = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/api-keys`, {
    headers: { Authorization: `Bearer ${process.env.MIGRATION_TARGET_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!result.ok) throw new Error("Target credentials unavailable.");
  const keys = await result.json();
  const getKey = (role) => {
    const key = keys.find((k) => k.name === role)?.api_key;
    const claim = JSON.parse(Buffer.from(key?.split(".")[1] ?? "", "base64url"));
    if (claim.ref !== targetRef || claim.role !== role)
      throw new Error("Credential identity mismatch.");
    return key;
  };
  Object.assign(process.env, {
    DATABASE_PROVIDER: "supabase",
    DATABASE_ENV: "migration",
    DATABASE_URL: connection.href,
    SUPABASE_DATABASE_URL: connection.href,
    SUPABASE_URL: `https://${targetRef}.supabase.co`,
    VITE_SUPABASE_URL: `https://${targetRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: getKey("service_role"),
    SUPABASE_ANON_KEY: getKey("anon"),
    VITE_SUPABASE_PUBLISHABLE_KEY: getKey("anon"),
    VITE_APP_ENV: "migration",
    VITE_AUTH_PROVIDER: "supabase",
    VITE_NEON_AUTH_URL: "",
    APP_URL: "http://localhost:5189",
    VITE_APP_URL: "http://localhost:5189",
    MAILJET_ENABLED: "false",
    MAILJET_API_KEY: "",
    MAILJET_SECRET_KEY: "",
    CRON_SECRET: "",
    VERCEL_ENV: "preview",
    SENTRY_AUTH_TOKEN: "",
    SENTRY_ORG: "",
    SENTRY_PROJECT: "",
    SENTRY_DSN: "",
    VITE_SENTRY_DSN: "",
  });
  const { createServer } = await import("vite");
  const server = await createServer({
    mode: "migration",
    server: {
      host: "127.0.0.1",
      port: 5189,
      strictPort: true,
      fs: {
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem}",
          "**/.git/**",
          "**/backup/**",
          "**/extension.local/**",
        ],
      },
    },
  });
  await server.listen();
  console.log(
    JSON.stringify({
      candidate: "http://localhost:5189",
      targetRef,
      mailDisabled: true,
      cronDisabled: true,
      productionChanged: false,
    }),
  );
}
main().catch(() => {
  console.error("Private migration candidate failed to start; production unchanged.");
  process.exitCode = 1;
});
