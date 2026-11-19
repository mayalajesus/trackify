import pg from "pg";
import { validateConnection } from "../../scripts/lib/supabase-migration-audit.mjs";
import { assertMigrationCandidate } from "../../scripts/lib/migration-project-status.mjs";

export function fixtureConnectionOptions(name) {
  const connectionString = process.env.DATABASE_URL;
  if (process.env.DATABASE_ENV === "migration") {
    const ref = "gfedmrhckghmgssgfwis";
    assertMigrationCandidate(ref);
    if (process.env.DATABASE_PROVIDER !== "supabase" || process.env.MIGRATION_TEST_PROJECT !== ref)
      throw new Error("Migration fixtures require the explicitly approved candidate.");
    const url = new URL(connectionString);
    if (url.searchParams.get("sslmode") !== "verify-full" || !url.searchParams.get("sslrootcert"))
      throw new Error("Migration fixtures require verified TLS.");
    const identityUrl = new URL(url);
    identityUrl.searchParams.delete("sslrootcert");
    validateConnection(identityUrl.href, ref);
    return {
      connectionString,
      connectionTimeoutMillis: 10000,
      // The contention fixture intentionally holds a lock across many remote
      // round trips. This is a harness deadline, not an application timeout.
      statement_timeout: 90000,
      query_timeout: 120000,
      application_name: `trackify-migration-${name}`,
    };
  }
  if (
    process.env.DATABASE_ENV !== "qa" ||
    process.env.DATABASE_PROVIDER !== "neon" ||
    !connectionString ||
    !new URL(connectionString).hostname.endsWith(".neon.tech")
  )
    throw new Error("These fixtures require the QA Neon database.");
  return {
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    application_name: `trackify-qa-${name}`,
  };
}

export function createQaClient(name) {
  return new pg.Client(fixtureConnectionOptions(name));
}
