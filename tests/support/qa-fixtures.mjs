import pg from "pg";

export function createQaClient(name) {
  const connectionString = process.env.DATABASE_URL;
  if (
    process.env.DATABASE_ENV !== "qa" ||
    process.env.DATABASE_PROVIDER !== "neon" ||
    !connectionString ||
    !new URL(connectionString).hostname.endsWith(".neon.tech")
  )
    throw new Error("These fixtures require the QA Neon database.");
  return new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    application_name: `trackify-qa-${name}`,
  });
}
