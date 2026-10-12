import { createClient } from "@supabase/supabase-js";

import pg from "pg";

import { DataApiError } from "../data-api-error.mjs";

export const Pool = pg.Pool;

export const pools = new Map();

export const supabaseAdmins = new Map();

export function envValue(env, key) {
  return env?.[key] ?? process.env[key] ?? "";
}

export function authOrigin(authUrl) {
  if (!authUrl) return "";
  try {
    return new URL(authUrl).origin;
  } catch {
    return "";
  }
}

export function providerEnv(env) {
  const databaseProvider = envValue(env, "DATABASE_PROVIDER");
  const vercelUrl = envValue(env, "VERCEL_URL");
  const neonAuthUrl = envValue(env, "VITE_NEON_AUTH_URL").replace(/\/$/, "");
  return {
    databaseProvider,
    extensionIds: envValue(env, "TRACKIFY_EXTENSION_IDS"),
    mailjet: {
      enabled:
        envValue(env, "MAILJET_ENABLED") === "true" &&
        envValue(env, "DATABASE_ENV") === "production" &&
        (!envValue(env, "VERCEL_ENV") || envValue(env, "VERCEL_ENV") === "production"),
      apiKey: envValue(env, "MAILJET_API_KEY"),
      secretKey: envValue(env, "MAILJET_SECRET_KEY"),
      fromEmail: envValue(env, "MAILJET_FROM_EMAIL"),
      fromName: envValue(env, "MAILJET_FROM_NAME") || "Trackify",
    },
    databaseUrl:
      envValue(env, "DATABASE_URL") ||
      (databaseProvider === "supabase" ? envValue(env, "SUPABASE_DATABASE_URL") : ""),
    appUrl:
      envValue(env, "APP_URL") ||
      envValue(env, "VITE_APP_URL") ||
      (vercelUrl ? `https://${vercelUrl}` : ""),
    neonAuthUrl,
    neonAuthIssuer: authOrigin(neonAuthUrl),
    supabaseUrl: (envValue(env, "SUPABASE_URL") || envValue(env, "VITE_SUPABASE_URL")).replace(
      /\/$/,
      "",
    ),
    supabasePublishableKey:
      envValue(env, "SUPABASE_ANON_KEY") || envValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY"),
    supabaseServiceRoleKey: envValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getSupabaseAdmin(config) {
  if (
    config.databaseProvider !== "supabase" ||
    !config.supabaseUrl ||
    !config.supabaseServiceRoleKey
  ) {
    throw new DataApiError(500, "Supabase server credentials are not configured.");
  }
  const cacheKey = `${config.supabaseUrl}:${config.supabaseServiceRoleKey.slice(-8)}`;
  let admin = supabaseAdmins.get(cacheKey);
  if (!admin) {
    admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    supabaseAdmins.set(cacheKey, admin);
  }
  return admin;
}

export function getPool(config) {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required by the data API.");
  let pool = pools.get(config.databaseUrl);
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      application_name: "trackify-api",
    });
    pools.set(config.databaseUrl, pool);
  }
  return pool;
}
