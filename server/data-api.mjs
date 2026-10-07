import { createClient } from "@supabase/supabase-js";
import { queueEmail, deliverInvitation, welcomeOnAccess } from "./transactional-emails.mjs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { avatarDataValue as profileAvatarDataValue } from "./auth-profile.mjs";
import { authenticateDataRequest } from "./authentication.mjs";
import {
  acceptLegalTerms,
  cancelAccountDeletion,
  enforceAccountLifecycle,
  exportAccountData,
  getAccountDeletionStatus,
  requestAccountDeletion,
  transferWorkspaceOwnership,
} from "./account-lifecycle.mjs";
import { DataApiError } from "./data-api-error.mjs";
import { enforceIpBurstLimit, enforceUserRateLimits } from "./rate-limit.mjs";
import {
  captureServerError,
  initializeServerObservability,
  sanitizeTelemetry,
} from "./observability.mjs";

const { Pool } = pg;
const pools = new Map();
const supabaseAdmins = new Map();
const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

// Initialize before the first request so server-side tracing can instrument the
// whole invocation. The helper is a no-op when SENTRY_DSN is not configured.
initializeServerObservability();
const MAX_INTEGER_SECONDS = 2_147_483_647;
const allowedCurrencies = new Set(["BRL", "USD", "EUR", "GBP"]);
const defaultAvatarUrls = [
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/green.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/orange.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/red.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/purple.jpg",
];

function envValue(env, key) {
  return env?.[key] ?? process.env[key] ?? "";
}

function authOrigin(authUrl) {
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

function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new DataApiError(400, "The data payload contains an invalid identifier.");
  }
  return value;
}

function dateValue(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      ) {
        return value;
      }
    }
  }
  throw new DataApiError(400, "The data payload contains an invalid date.");
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
}

function timeValue(value) {
  if (
    typeof value !== "string" ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value)
  ) {
    throw new DataApiError(400, "The data payload contains an invalid time.");
  }
  return value;
}

function normalizeProjectName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function ensureProjectNameAvailable(client, workspaceId, clientId, name, projectId = null) {
  const result = await client.query(
    `select 1
       from public.projects
      where workspace_id = $1
        and client_id = $2
        and lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $3
        and ($4::uuid is null or id <> $4::uuid)
      limit 1`,
    [workspaceId, clientId, normalizeProjectName(name), projectId],
  );
  if (result.rows[0]) {
    throw new DataApiError(409, "A project with this name already exists for this client.");
  }
}

function numberValue(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function requiredText(value, label, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new DataApiError(400, `${label} must be between 1 and ${maxLength} characters.`);
  }
  return text;
}

function optionalText(value, label, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (text.length > maxLength) {
    throw new DataApiError(400, `${label} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function optionalCurrency(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!allowedCurrencies.has(value)) {
    throw new DataApiError(400, "Choose a valid currency.");
  }
  return value;
}

function projectColorValue(value) {
  const color = requiredText(value, "Project color", 40).toLowerCase();
  const legacyColors = new Set([
    "accent",
    "bg-accent",
    "success",
    "bg-success",
    "warning",
    "bg-warning",
    "danger",
    "bg-danger",
    "foreground",
    "bg-foreground",
  ]);
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(color) && !legacyColors.has(color)) {
    throw new DataApiError(400, "Choose a valid project color.");
  }
  return color;
}

function membershipBilling(membership) {
  const hourlyRate = Number(membership?.hourlyRate);
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new DataApiError(400, "Choose a valid hourly rate.");
  }
  if (!allowedCurrencies.has(membership?.currency)) {
    throw new DataApiError(400, "Choose a valid currency.");
  }
  return { hourlyRate, currency: membership.currency };
}

const avatarDataValue = (value) => profileAvatarDataValue(value, defaultAvatarUrls);

function defaultAvatarForUser(userId) {
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return defaultAvatarUrls[hash % defaultAvatarUrls.length];
}

function invitationMember(row) {
  const name = String(row.email ?? "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return {
    id: row.id,
    name: name || "Invited user",
    email: row.email,
    initials,
    role: row.role,
    status: "invited",
    invitedAt: iso(row.invited_at),
  };
}

async function signedStorageUrl(config, bucket, path) {
  if (!path || config.databaseProvider !== "supabase") return null;
  const { data, error } = await getSupabaseAdmin(config)
    .storage.from(bucket)
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) throw new DataApiError(500, `Could not load ${bucket} media.`);
  return data.signedUrl;
}

function parseImageDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength > 1_048_576) {
    throw new DataApiError(400, "The image must be smaller than 1 MB.");
  }
  return { bytes, contentType: match[1] };
}

function workspaceLogoPath(workspaceId, image, currentPath = null) {
  const digest = createHash("sha256").update(image.contentType).update(image.bytes).digest("hex");
  if (currentPath?.endsWith(`-${digest}`)) return currentPath;
  // Never overwrite a cached object, or reuse a path scheduled for deletion.
  return `${workspaceId}/${randomUUID()}-${digest}`;
}

function favoriteTasksValue(value) {
  const favorites = value ?? {};
  if (
    !favorites ||
    typeof favorites !== "object" ||
    Array.isArray(favorites) ||
    JSON.stringify(favorites).length > 100000 ||
    !Object.values(favorites).every(
      (items) =>
        Array.isArray(items) &&
        items.length <= 100 &&
        items.every(
          (item) =>
            item &&
            typeof item.task === "string" &&
            item.task.trim().length > 0 &&
            item.task.length <= 500 &&
            typeof item.projectId === "string" &&
            item.projectId.length > 0 &&
            typeof item.billable === "boolean",
        ),
    )
  ) {
    throw new DataApiError(400, "Invalid favorite tasks.");
  }
  return favorites;
}

function reportFiltersValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function reportFiltersJson(value) {
  const serialized = JSON.stringify(reportFiltersValue(value));
  if (Buffer.byteLength(serialized, "utf8") > 100_000) {
    throw new DataApiError(400, "The saved report filters are too large.");
  }
  return serialized;
}

async function hasColumn(client, tableName, columnName) {
  const result = await client.query(
    `select exists (
       select 1
         from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2
     ) as present`,
    [tableName, columnName],
  );
  return Boolean(result.rows[0]?.present);
}

async function workspaceAccess(client, userId, workspaceId) {
  const result = await client.query(
    `select w.status, w.owner_id, wm.role, wm.status as membership_status
       from public.workspace_members wm
       join public.workspaces w on w.id = wm.workspace_id
      where wm.workspace_id = $1 and wm.user_id = $2
      limit 1`,
    [workspaceId, userId],
  );
  return result.rows[0] ?? null;
}

async function requireWorkspaceAccess(client, userId, workspaceId, allowArchived = false) {
  const access = await workspaceAccess(client, userId, workspaceId);
  if (!access || access.membership_status !== "active") {
    throw new DataApiError(403, "You do not have access to this workspace.");
  }
  if (!allowArchived && access.status !== "active") {
    throw new DataApiError(403, "Archived workspaces are read-only.");
  }
  return access;
}

function requirePayloadUser(user, body) {
  if (body.userId !== undefined && body.userId !== user.id) {
    throw new DataApiError(403, "The authenticated user does not match the request.");
  }
}

async function ensureProfile(client, user, config) {
  const existingProfile = await client.query(
    `select name, email from public.profiles where id = $1 limit 1`,
    [user.id],
  );
  const storedProfile = existingProfile.rows[0];
  const authenticatedName = String(user.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const authenticatedEmail = String(user.email ?? "")
    .trim()
    .toLowerCase();
  const name =
    authenticatedName ||
    String(storedProfile?.name ?? "")
      .trim()
      .replace(/\s+/g, " ");
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authenticatedEmail)
    ? authenticatedEmail
    : String(storedProfile?.email ?? "")
        .trim()
        .toLowerCase();
  if (!name) {
    throw new DataApiError(400, "A profile name is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DataApiError(400, "A valid email is required.");
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ||
    (user.email[0]?.toUpperCase() ?? "?");
  await client.query(
    `insert into public.profiles (id, auth_issuer, name, email, initials)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       auth_issuer = excluded.auth_issuer,
       email = case when excluded.email <> '' then excluded.email else profiles.email end,
       name = case when profiles.name = '' and excluded.name <> '' then excluded.name else profiles.name end,
       initials = case when profiles.initials = '' and excluded.initials <> '' then excluded.initials else profiles.initials end,
       updated_at = now()`,
    [user.id, config.databaseProvider, name, email, initials],
  );
  await client.query(
    `insert into public.user_preferences (user_id, language) values ($1, $2)
     on conflict (user_id) do nothing`,
    [user.id, config.initialLanguage === "pt-BR" ? "pt-BR" : "en-US"],
  );
  if (user.avatarUrl && (await hasColumn(client, "user_preferences", "avatar_data_url"))) {
    await client.query(
      `update public.user_preferences
          set avatar_data_url = $2, updated_at = now()
        where user_id = $1
          and (
            avatar_data_url is null
            or avatar_data_url = ''
            or avatar_data_url = any($3::text[])
          )`,
      [user.id, user.avatarUrl, defaultAvatarUrls],
    );
  }
}

function emptyTrello() {
  return {
    status: "disconnected",
    workspace: null,
    board: null,
    lists: [],
    cards: [],
    rule: "lists",
    lastSync: null,
  };
}

function timeEntryFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
    ...(row.end_date !== row.date ? { endDate: row.end_date } : {}),
    ...(row.start_at ? { startTimestamp: new Date(row.start_at).getTime() } : {}),
    ...(row.end_at ? { endTimestamp: new Date(row.end_at).getTime() } : {}),
    seconds: row.duration_seconds,
    userId: row.user_id,
    projectId: row.project_id,
    task: row.task,
    ...(row.description ? { description: row.description } : {}),
    billable: row.billable,
    ...(row.hourly_rate !== null ? { hourlyRate: numberValue(row.hourly_rate) } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
  };
}

export async function loadAccount(client, user, config) {
  await ensureProfile(client, user, config);
  const hasLogoPath = await hasColumn(client, "workspaces", "logo_path");
  const hasLogoData = await hasColumn(client, "workspaces", "logo_data_url");
  const hasActiveWorkspace = await hasColumn(client, "user_preferences", "active_workspace_id");
  const hasReportFilters = await hasColumn(client, "user_preferences", "report_filters");
  const workspaces = await client.query(
    `select w.id::text, w.name, w.owner_id, w.status, w.created_at, w.archived_at,
            ${hasLogoPath ? "w.logo_path" : "null::text as logo_path"},
            ${hasLogoData ? "w.logo_data_url" : "null::text as logo_data_url"}
       from public.workspaces w
       join public.workspace_members access on access.workspace_id = w.id
      where access.user_id = $1 and access.status = 'active'
      order by w.created_at asc`,
    [user.id],
  );
  const workspaceIds = workspaces.rows.map((row) => row.id);
  const identityRows = await client.query(
    `select distinct p.id, p.name, p.email, p.initials, p.avatar_path
       from public.profiles p
      where p.id = $2
         or exists (
           select 1
             from public.workspace_members wm
            where wm.user_id = p.id
              and wm.workspace_id = any($1::uuid[])
         )`,
    [workspaceIds, user.id],
  );
  const invitations = await client.query(
    `select id::text, workspace_id::text, email, role, invited_at, expires_at
       from public.workspace_invitations
      where workspace_id = any($1::uuid[])
        and status = 'pending'
        and expires_at > now()
        and exists (
          select 1
            from public.workspace_members actor
           where actor.workspace_id = workspace_invitations.workspace_id
             and actor.user_id = $2
             and actor.status = 'active'
             and actor.role in ('Owner', 'Admin')
        )
      order by invited_at desc`,
    [workspaceIds, user.id],
  );
  const identityById = new Map(identityRows.rows.map((row) => [row.id, row]));
  for (const row of invitations.rows) {
    const pending = invitationMember(row);
    identityById.set(pending.id, pending);
  }
  const identities = [...identityById.values()].map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    initials: row.initials,
  }));
  const profileIds = identityRows.rows.map((identity) => identity.id);
  const memberships = await client.query(
    `select workspace_id::text, user_id, role, status, hourly_rate, currency, invited_at, joined_at
     from public.workspace_members where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const settings = await client.query(
    `select workspace_id::text, week_start from public.workspace_settings where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const clients = await client.query(
    `select id::text, workspace_id::text, name, contact, billable, currency from public.clients where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const projects = await client.query(
    `select id::text, workspace_id::text, name, client_id::text, billable, status, color, last_activity::text from public.projects where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const projectMembers = await client.query(
    `select project_id::text, user_id from public.project_members where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const entries = await client.query(
    `select id::text, workspace_id::text, date::text, start_time::text, end_time::text, end_date::text, start_at, end_at, duration_seconds, user_id, project_id::text, task, description, billable, hourly_rate, currency
       from public.time_entries e
      where e.workspace_id = any($1::uuid[])
        and (
          e.user_id = $2
          or exists (
            select 1
              from public.workspace_members viewer
             where viewer.workspace_id = e.workspace_id
               and viewer.user_id = $2
               and viewer.status = 'active'
               and viewer.role in ('Admin', 'Owner')
          )
        )
      order by date asc, start_time asc`,
    [workspaceIds, user.id],
  );
  const hasAvatarData = await hasColumn(client, "user_preferences", "avatar_data_url");
  if (hasAvatarData) {
    for (const id of profileIds) {
      await client.query(
        `insert into public.user_preferences (user_id, avatar_data_url)
         values ($1, $2)
         on conflict (user_id) do update
           set avatar_data_url = coalesce(nullif(public.user_preferences.avatar_data_url, ''), excluded.avatar_data_url),
               updated_at = now()`,
        [id, defaultAvatarForUser(id)],
      );
    }
  }
  const preferences = await client.query(
    `select user_id, language, theme, timezone, idle_detection, ${
      hasAvatarData ? "avatar_data_url" : "null::text as avatar_data_url"
    }, ${hasActiveWorkspace ? "active_workspace_id::text" : "null::text as active_workspace_id"},
       ${hasReportFilters ? "report_filters" : "'{}'::jsonb as report_filters"},
       ${(await hasColumn(client, "user_preferences", "favorite_tasks")) ? "favorite_tasks" : "'{}'::jsonb as favorite_tasks"}
       from public.user_preferences where user_id = any($1::text[])`,
    [profileIds],
  );
  const settingsByWorkspace = new Map(settings.rows.map((row) => [row.workspace_id, row]));
  const membershipsByWorkspace = new Map();
  for (const row of memberships.rows) {
    const list = membershipsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      hourlyRate: numberValue(row.hourly_rate),
      currency: ["BRL", "USD", "EUR", "GBP"].includes(row.currency) ? row.currency : "USD",
      ...(row.invited_at ? { invitedAt: iso(row.invited_at) } : {}),
      ...(row.joined_at ? { joinedAt: iso(row.joined_at) } : {}),
    });
    membershipsByWorkspace.set(row.workspace_id, list);
  }
  for (const row of invitations.rows) {
    const list = membershipsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      workspaceId: row.workspace_id,
      userId: row.id,
      role: row.role,
      status: "invited",
      hourlyRate: 0,
      currency: "USD",
      invitedAt: iso(row.invited_at),
    });
    membershipsByWorkspace.set(row.workspace_id, list);
  }
  const clientsByWorkspace = new Map();
  for (const row of clients.rows) {
    const list = clientsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      contact: row.contact,
      billable: row.billable ?? false,
      ...(row.currency ? { currency: row.currency } : {}),
    });
    clientsByWorkspace.set(row.workspace_id, list);
  }
  const memberIdsByProject = new Map();
  for (const row of projectMembers.rows) {
    const list = memberIdsByProject.get(row.project_id) ?? [];
    list.push(row.user_id);
    memberIdsByProject.set(row.project_id, list);
  }
  const projectsByWorkspace = new Map();
  for (const row of projects.rows) {
    const list = projectsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      clientId: row.client_id,
      billable: row.billable,
      status: row.status,
      color: row.color,
      lastActivity: row.last_activity,
      memberIds: memberIdsByProject.get(row.id) ?? [],
    });
    projectsByWorkspace.set(row.workspace_id, list);
  }
  const entriesByWorkspace = new Map();
  for (const row of entries.rows) {
    const list = entriesByWorkspace.get(row.workspace_id) ?? [];
    list.push(timeEntryFromRow(row));
    entriesByWorkspace.set(row.workspace_id, list);
  }
  const avatarUrlsById = new Map();
  for (const row of identityRows.rows) {
    if (row.avatar_path) {
      avatarUrlsById.set(row.id, await signedStorageUrl(config, "avatars", row.avatar_path));
    }
  }
  const logoUrlsByWorkspaceId = new Map();
  for (const row of workspaces.rows) {
    if (row.logo_path) {
      logoUrlsByWorkspaceId.set(
        row.id,
        await signedStorageUrl(config, "workspace-logos", row.logo_path),
      );
    }
  }
  const preferencesByUserId = Object.fromEntries(
    profileIds.map((id) => {
      const row = preferences.rows.find((candidate) => candidate.user_id === id);
      const isOwnPreferences = id === user.id;
      return [
        id,
        {
          idleDetection: isOwnPreferences ? (row?.idle_detection ?? true) : true,
          language: isOwnPreferences && row?.language === "pt-BR" ? "pt-BR" : "en-US",
          theme:
            isOwnPreferences && (row?.theme === "light" || row?.theme === "dark")
              ? row.theme
              : "system",
          avatarUrl:
            avatarUrlsById.get(id) ??
            avatarDataValue(row?.avatar_data_url) ??
            defaultAvatarForUser(id),
          timezone: isOwnPreferences ? (row?.timezone ?? "UTC") : "UTC",
          activeWorkspaceId: isOwnPreferences ? (row?.active_workspace_id ?? null) : null,
          reportFilters: isOwnPreferences ? reportFiltersValue(row?.report_filters) : {},
          favoriteTasks: isOwnPreferences ? favoriteTasksValue(row?.favorite_tasks) : {},
        },
      ];
    }),
  );
  return {
    version: 13,
    identities,
    workspaces: workspaces.rows.map((row) => ({
      workspace: {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        logoDataUrl: row.logo_data_url ?? logoUrlsByWorkspaceId.get(row.id) ?? null,
        status: row.status,
        createdAt: iso(row.created_at),
        ...(row.archived_at ? { archivedAt: iso(row.archived_at) } : {}),
      },
      memberships: membershipsByWorkspace.get(row.id) ?? [],
      entries: entriesByWorkspace.get(row.id) ?? [],
      projects: projectsByWorkspace.get(row.id) ?? [],
      clients: clientsByWorkspace.get(row.id) ?? [],
      settings: {
        weekStart: settingsByWorkspace.get(row.id)?.week_start === "sunday" ? "sunday" : "monday",
      },
      trello: emptyTrello(),
    })),
    preferencesByUserId,
  };
}

export async function createWorkspace(client, user, config, body) {
  await ensureProfile(client, user, config);
  const name = requiredText(body.name, "Workspace name", 120).replace(/\s+/g, " ");
  const billing = membershipBilling({
    hourlyRate: body.hourlyRate,
    currency: body.currency,
  });
  await client.query(
    `select pg_advisory_xact_lock(hashtextextended('minvio:workspace-create:' || $1, 0))`,
    [user.id],
  );
  const owned = await client.query(
    `select count(*)::integer as count
       from public.workspaces
      where owner_id = $1`,
    [user.id],
  );
  if (Number(owned.rows[0]?.count ?? 0) >= 5) {
    throw new DataApiError(409, "You can create up to 5 workspaces.");
  }

  let logo = null;
  if (body.logoDataUrl !== undefined && body.logoDataUrl !== null) {
    logo = parseImageDataUrl(body.logoDataUrl);
    if (!logo) throw new DataApiError(400, "Choose a valid PNG, JPG or WebP logo.");
    if (logo.bytes.byteLength > 500_000) {
      throw new DataApiError(400, "Workspace logos must be smaller than 500 KB.");
    }
  }

  const workspaceId = randomUUID();
  await client.query(
    `insert into public.workspaces (id, name, owner_id, status)
     values ($1, $2, $3, 'active')`,
    [workspaceId, name, user.id],
  );
  await client.query(
    `update public.workspace_members
        set hourly_rate = $3, currency = $4
      where workspace_id = $1 and user_id = $2`,
    [workspaceId, user.id, billing.hourlyRate, billing.currency],
  );

  if (logo && config.databaseProvider !== "supabase") {
    await client.query(`update public.workspaces set logo_data_url = $2 where id = $1`, [
      workspaceId,
      `data:${logo.contentType};base64,${logo.bytes.toString("base64")}`,
    ]);
  } else if (logo) {
    const logoPath = workspaceLogoPath(workspaceId, logo);
    const uploaded = await getSupabaseAdmin(config)
      .storage.from("workspace-logos")
      .upload(logoPath, logo.bytes, { contentType: logo.contentType, upsert: true });
    if (uploaded.error) throw new DataApiError(500, "Could not save the workspace logo.");
    await client.query(`update public.workspaces set logo_path = $2 where id = $1`, [
      workspaceId,
      logoPath,
    ]);
  }

  if (await hasColumn(client, "user_preferences", "active_workspace_id")) {
    await client.query(
      `update public.user_preferences
          set active_workspace_id = $2, updated_at = now()
        where user_id = $1`,
      [user.id, workspaceId],
    );
  }
  return { workspaceId, account: await loadAccount(client, user, config) };
}

async function loadReportEntries(client, user, body) {
  const workspaceId = uuid(body.workspaceId);
  const startDate = dateValue(body.startDate);
  const endDate = dateValue(body.endDate);
  if (endDate < startDate) {
    throw new DataApiError(400, "The report period is invalid.");
  }

  const access = await requireWorkspaceAccess(client, user.id, workspaceId);
  const result = await client.query(
    `select id::text, date::text, start_time::text, end_time::text, end_date::text,
            start_at, end_at, duration_seconds, user_id, project_id::text, task,
            description, billable, hourly_rate, currency
       from public.time_entries e
      where e.workspace_id = $1
        and (
          (e.date >= $2::date and e.date <= $3::date)
          or (e.date < $2::date and e.end_date >= $2::date)
        )
        and ($4::boolean or e.user_id = $5)
      order by e.date asc, e.start_time asc, e.id asc`,
    [workspaceId, startDate, endDate, access.role !== "Member", user.id],
  );

  return result.rows.map(timeEntryFromRow);
}

export async function upsertOwnEntry(client, userId, workspaceId, entry, entryId) {
  if (typeof entry.userId !== "string" || entry.userId !== userId) {
    throw new DataApiError(403, "You can only update your own time entries.");
  }
  const endDate = entry.endDate ?? entry.date;
  const seconds = Number(entry.seconds);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_INTEGER_SECONDS) {
    throw new DataApiError(400, "The data payload contains an invalid duration.");
  }
  const hourlyRate = entry.hourlyRate === undefined ? null : Number(entry.hourlyRate);
  if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
    throw new DataApiError(400, "The data payload contains an invalid hourly rate.");
  }
  let startAt = null;
  let endAt = null;
  try {
    startAt =
      typeof entry.startTimestamp === "number"
        ? new Date(entry.startTimestamp).toISOString()
        : null;
    endAt =
      typeof entry.endTimestamp === "number" ? new Date(entry.endTimestamp).toISOString() : null;
  } catch {
    throw new DataApiError(400, "The data payload contains an invalid timestamp.");
  }
  if ((startAt === null) !== (endAt === null) || (startAt && endAt && endAt <= startAt)) {
    throw new DataApiError(400, "The data payload contains an invalid time interval.");
  }
  const result = await client.query(
    `insert into public.time_entries (id, workspace_id, user_id, date, start_time, end_time, end_date, start_at, end_at, duration_seconds, project_id, task, description, billable, hourly_rate, currency)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     on conflict (id) do update set date = excluded.date, start_time = excluded.start_time, end_date = excluded.end_date, end_time = excluded.end_time, start_at = excluded.start_at, end_at = excluded.end_at, duration_seconds = excluded.duration_seconds, project_id = excluded.project_id, task = excluded.task, description = excluded.description, billable = excluded.billable, hourly_rate = excluded.hourly_rate, currency = excluded.currency, updated_at = now()
     where time_entries.workspace_id = excluded.workspace_id
       and time_entries.user_id = excluded.user_id
     returning id::text`,
    [
      entryId,
      workspaceId,
      userId,
      dateValue(entry.date),
      timeValue(entry.start),
      timeValue(entry.end),
      dateValue(endDate),
      startAt,
      endAt,
      Math.floor(seconds),
      entry.projectId ? uuid(entry.projectId) : null,
      requiredText(entry.task, "Task", 240),
      optionalText(entry.description, "Description", 10_000),
      Boolean(entry.billable),
      hourlyRate,
      optionalCurrency(entry.currency),
    ],
  );
  if (!result.rowCount) {
    throw new DataApiError(403, "A time entry identifier belongs to another user or workspace.");
  }
}

export async function syncEntries(client, userId, workspaceId, entries) {
  if (!Array.isArray(entries)) throw new DataApiError(400, "Invalid time entries payload.");
  const ownEntries = entries.filter((entry) => entry?.userId === userId);
  const entryIds = ownEntries.map((entry) => uuid(entry.id));
  if (new Set(entryIds).size !== entryIds.length) {
    throw new DataApiError(400, "The data payload contains duplicate time entry identifiers.");
  }

  await client.query(
    `delete from public.time_entries
      where workspace_id = $1 and user_id = $2 and not (id = any($3::uuid[]))`,
    [workspaceId, userId, entryIds],
  );

  for (const [index, entry] of ownEntries.entries()) {
    await upsertOwnEntry(client, userId, workspaceId, entry, entryIds[index]);
  }
}

async function syncAccount(client, user, config, account) {
  const obsoleteLogoPaths = [];
  if (!account || !Array.isArray(account.identities) || !Array.isArray(account.workspaces))
    throw new DataApiError(400, "Invalid account payload.");
  await ensureProfile(client, user, config);
  const hasLogoPath = await hasColumn(client, "workspaces", "logo_path");
  const hasActiveWorkspace = await hasColumn(client, "user_preferences", "active_workspace_id");
  const hasReportFilters = await hasColumn(client, "user_preferences", "report_filters");
  const identities = new Map(
    account.identities
      .filter((item) => item && typeof item.id === "string")
      .map((identity) => [identity.id, identity]),
  );
  const ownIdentity = identities.get(user.id);
  if (!ownIdentity) throw new DataApiError(400, "The authenticated profile is missing.");
  const ownName = String(ownIdentity.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const ownEmail = String(ownIdentity.email ?? "")
    .trim()
    .toLowerCase();
  if (!ownName || ownName.length > 120 || ownName.split(" ").length < 2) {
    throw new DataApiError(400, "A first and last name are required.");
  }
  if (ownEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownEmail)) {
    throw new DataApiError(400, "A valid email is required.");
  }
  const ownInitials = ownName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  await client.query(
    `update public.profiles set name = $2, email = $3, initials = $4, updated_at = now() where id = $1`,
    [user.id, ownName, ownEmail, ownInitials],
  );
  const ownPreferences = account.preferencesByUserId?.[user.id];
  if (ownPreferences) {
    const preferenceValues = [
      user.id,
      ownPreferences.language,
      ownPreferences.theme,
      ownPreferences.timezone,
      ownPreferences.idleDetection,
    ];
    await client.query(
      `insert into public.user_preferences (user_id, language, theme, timezone, idle_detection)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set language = excluded.language, theme = excluded.theme, timezone = excluded.timezone, idle_detection = excluded.idle_detection, updated_at = now()`,
      preferenceValues,
    );
    if (ownPreferences.favoriteTasks !== undefined) {
      await client.query(
        `update public.user_preferences set favorite_tasks = $2::jsonb, updated_at = now() where user_id = $1`,
        [user.id, JSON.stringify(favoriteTasksValue(ownPreferences.favoriteTasks))],
      );
    }
    if (hasReportFilters) {
      await client.query(
        `update public.user_preferences set report_filters = $2::jsonb, updated_at = now() where user_id = $1`,
        [user.id, reportFiltersJson(ownPreferences.reportFilters)],
      );
    }
    if (await hasColumn(client, "user_preferences", "avatar_data_url")) {
      await client.query(
        `update public.user_preferences
            set avatar_data_url = coalesce($2, avatar_data_url), updated_at = now()
          where user_id = $1`,
        [user.id, avatarDataValue(ownPreferences.avatarUrl)],
      );
    }
  }
  for (const data of account.workspaces) {
    if (!data || typeof data !== "object" || !data.workspace) {
      throw new DataApiError(400, "Invalid workspace payload.");
    }
    for (const collection of ["memberships", "clients", "projects", "entries"]) {
      if (data[collection] !== undefined && !Array.isArray(data[collection])) {
        throw new DataApiError(400, "Invalid workspace payload.");
      }
    }
    const workspaceId = uuid(data.workspace.id);
    const ownerId = String(data.workspace.ownerId);
    if (data.workspace.status !== "active" && data.workspace.status !== "archived") {
      throw new DataApiError(400, "Choose a valid workspace status.");
    }
    const existingWorkspace = await client.query(
      `select owner_id, name, status, ${
        hasLogoPath ? "logo_path" : "null::text as logo_path"
      } from public.workspaces where id = $1`,
      [workspaceId],
    );
    if (!existingWorkspace.rows[0]) {
      throw new DataApiError(409, "Create new workspaces with the createWorkspace operation.");
    }
    const access = await workspaceAccess(client, user.id, workspaceId);
    if (!access || access.membership_status !== "active") {
      throw new DataApiError(403, "You do not have permission to update this workspace.");
    }
    if (existingWorkspace.rows[0].owner_id !== ownerId) {
      throw new DataApiError(403, "The workspace owner cannot be changed.");
    }
    if (
      access.role !== "Owner" &&
      (data.workspace.name !== existingWorkspace.rows[0].name ||
        data.workspace.status !== existingWorkspace.rows[0].status)
    ) {
      throw new DataApiError(403, "Only the workspace Owner can edit it.");
    }
    if (existingWorkspace.rows[0] && access.status === "archived" && access.role !== "Owner") {
      continue;
    }
    let logoPath = existingWorkspace.rows[0]?.logo_path ?? null;
    if (access.role === "Owner" && config.databaseProvider !== "supabase") {
      const image = parseImageDataUrl(data.workspace.logoDataUrl);
      if (image && image.bytes.byteLength > 500_000) {
        throw new DataApiError(400, "Workspace logos must be smaller than 500 KB.");
      }
      if (image || data.workspace.logoDataUrl === null) {
        await client.query(`update public.workspaces set logo_data_url = $2 where id = $1`, [
          workspaceId,
          image ? `data:${image.contentType};base64,${image.bytes.toString("base64")}` : null,
        ]);
      }
    } else if (hasLogoPath && access.role === "Owner" && config.databaseProvider === "supabase") {
      const image = parseImageDataUrl(data.workspace.logoDataUrl);
      if (image && image.bytes.byteLength > 500_000) {
        throw new DataApiError(400, "Workspace logos must be smaller than 500 KB.");
      }
      if (image) {
        const nextPath = workspaceLogoPath(workspaceId, image, logoPath);
        if (nextPath !== logoPath) {
          const { error } = await getSupabaseAdmin(config)
            .storage.from("workspace-logos")
            .upload(nextPath, image.bytes, { contentType: image.contentType, upsert: false });
          if (error) throw new DataApiError(500, "Could not save the workspace logo.");
          if (logoPath) obsoleteLogoPaths.push(logoPath);
          logoPath = nextPath;
        }
      } else if (data.workspace.logoDataUrl === null && logoPath) {
        obsoleteLogoPaths.push(logoPath);
        logoPath = null;
      }
    }
    if (access.role !== "Member") {
      const workspaceValues = [
        workspaceId,
        requiredText(data.workspace.name, "Workspace name", 120),
        ownerId,
        data.workspace.status,
        data.workspace.createdAt,
        data.workspace.archivedAt ?? null,
      ];
      if (hasLogoPath) {
        await client.query(
          `insert into public.workspaces (id, name, owner_id, status, created_at, archived_at, logo_path)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (id) do update set name = excluded.name, owner_id = excluded.owner_id, status = excluded.status, archived_at = excluded.archived_at, logo_path = excluded.logo_path`,
          [...workspaceValues, logoPath],
        );
      } else {
        await client.query(
          `insert into public.workspaces (id, name, owner_id, status, created_at, archived_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do update set name = excluded.name, owner_id = excluded.owner_id, status = excluded.status, archived_at = excluded.archived_at`,
          workspaceValues,
        );
      }
      await client.query(
        `insert into public.workspace_settings (workspace_id, week_start)
         values ($1, $2)
         on conflict (workspace_id) do update set week_start = excluded.week_start, updated_at = now()`,
        [workspaceId, data.settings?.weekStart === "sunday" ? "sunday" : "monday"],
      );
    }
    const memberships = Array.isArray(data.memberships)
      ? data.memberships.filter((membership) => membership?.status !== "invited")
      : [];
    if (access.role === "Member") {
      const ownMembership = memberships.find((membership) => membership?.userId === user.id);
      if (!ownMembership || ownMembership.status !== "active") {
        throw new DataApiError(403, "You cannot remove your own workspace access.");
      }
      const billing = membershipBilling(ownMembership);
      await client.query(
        `update public.workspace_members
            set hourly_rate = $3, currency = $4
          where workspace_id = $1 and user_id = $2 and status = 'active'`,
        [workspaceId, user.id, billing.hourlyRate, billing.currency],
      );
      await syncEntries(client, user.id, workspaceId, data.entries ?? []);
      continue;
    }
    const membershipByUserId = new Map();
    const protectedMembershipIds = new Set();
    for (const membership of memberships) {
      if (!membership || typeof membership.userId !== "string") {
        throw new DataApiError(400, "Invalid workspace membership payload.");
      }
      if (
        !["Owner", "Admin", "Member"].includes(membership.role) ||
        !["active", "invited", "removed"].includes(membership.status)
      ) {
        throw new DataApiError(400, "Invalid workspace membership payload.");
      }
      membershipBilling(membership);
      membershipByUserId.set(membership.userId, membership);
      const identity = identities.get(membership.userId);
      if (!identity) throw new DataApiError(400, "A workspace member profile is missing.");
      const existingMembership = await client.query(
        `select role, status from public.workspace_members where workspace_id = $1 and user_id = $2`,
        [workspaceId, membership.userId],
      );
      const previousMembership = existingMembership.rows[0];
      if (!previousMembership && membership.userId !== user.id) {
        throw new DataApiError(
          403,
          "New workspace members must accept a valid invitation before they become active.",
        );
      }
      if (membership.userId !== user.id) {
        const existingProfile = await client.query(`select 1 from public.profiles where id = $1`, [
          membership.userId,
        ]);
        if (!existingProfile.rowCount) {
          await client.query(
            `insert into public.profiles (id, auth_issuer, name, email, initials) values ($1, $2, $3, $4, $5)`,
            [
              membership.userId,
              config.databaseProvider,
              String(identity.name ?? "Invited user"),
              String(identity.email ?? ""),
              String(identity.initials ?? "IU"),
            ],
          );
        }
      }
      if (
        membership.role === "Owner" &&
        (membership.userId !== ownerId || membership.status !== "active")
      ) {
        throw new DataApiError(400, "A workspace must have one active Owner.");
      }
      if (
        access.role === "Admin" &&
        membership.userId !== user.id &&
        ((membership.role === "Owner" && previousMembership?.role !== "Owner") ||
          (["Owner", "Admin"].includes(previousMembership?.role) &&
            (membership.role !== previousMembership.role ||
              membership.status !== previousMembership.status)))
      ) {
        throw new DataApiError(403, "Admins cannot manage Owners or Admins.");
      }
      if (
        access.role === "Admin" &&
        membership.userId !== user.id &&
        ["Owner", "Admin"].includes(previousMembership?.role)
      ) {
        protectedMembershipIds.add(membership.userId);
      }
    }
    const ownerMembership = membershipByUserId.get(ownerId);
    if (
      !ownerMembership ||
      ownerMembership.role !== "Owner" ||
      ownerMembership.status !== "active"
    ) {
      throw new DataApiError(400, "A workspace must have one active Owner.");
    }
    if (!membershipByUserId.has(user.id) || membershipByUserId.get(user.id).status !== "active") {
      throw new DataApiError(403, "You cannot remove your own workspace access.");
    }
    const existingMemberships = await client.query(
      `select user_id, role from public.workspace_members where workspace_id = $1`,
      [workspaceId],
    );
    for (const existingMembership of existingMemberships.rows) {
      if (membershipByUserId.has(existingMembership.user_id)) continue;
      if (
        existingMembership.role === "Owner" ||
        (access.role === "Admin" && existingMembership.role === "Admin")
      ) {
        throw new DataApiError(403, "You cannot remove this workspace member.");
      }
    }
    await client.query(`delete from public.project_members where workspace_id = $1`, [workspaceId]);
    await client.query(
      `delete from public.projects where workspace_id = $1 and not (id = any($2::uuid[]))`,
      [workspaceId, (data.projects ?? []).map((project) => uuid(project.id))],
    );
    await client.query(
      `delete from public.clients where workspace_id = $1 and not (id = any($2::uuid[]))`,
      [workspaceId, (data.clients ?? []).map((item) => uuid(item.id))],
    );
    await client.query(
      `delete from public.workspace_members where workspace_id = $1 and not (user_id = any($2::text[]))`,
      [workspaceId, memberships.map((item) => String(item.userId))],
    );
    for (const membership of memberships) {
      // Protected members are included in every account snapshot. Validation
      // above rejects role/status changes; do not rewrite their other fields.
      if (protectedMembershipIds.has(membership.userId)) continue;
      if (membership.userId === user.id) {
        const billing = membershipBilling(membership);
        await client.query(
          `insert into public.workspace_members (workspace_id, user_id, role, status, hourly_rate, currency, invited_at, joined_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (workspace_id, user_id) do update set role = excluded.role, status = excluded.status, hourly_rate = excluded.hourly_rate, currency = excluded.currency, invited_at = excluded.invited_at, joined_at = excluded.joined_at`,
          [
            workspaceId,
            membership.userId,
            membership.role,
            membership.status,
            billing.hourlyRate,
            billing.currency,
            membership.invitedAt ?? null,
            membership.joinedAt ?? null,
          ],
        );
      } else {
        await client.query(
          `insert into public.workspace_members (workspace_id, user_id, role, status, invited_at, joined_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (workspace_id, user_id) do update set role = excluded.role, status = excluded.status, invited_at = excluded.invited_at, joined_at = excluded.joined_at`,
          [
            workspaceId,
            membership.userId,
            membership.role,
            membership.status,
            membership.invitedAt ?? null,
            membership.joinedAt ?? null,
          ],
        );
      }
    }
    for (const item of data.clients ?? []) {
      if (!item || typeof item !== "object") {
        throw new DataApiError(400, "Invalid client payload.");
      }
      if (item.billable !== undefined && typeof item.billable !== "boolean") {
        throw new DataApiError(400, "Invalid client billable value.");
      }
      if (item.currency !== undefined && !["BRL", "USD", "EUR"].includes(item.currency)) {
        throw new DataApiError(400, "Choose a valid currency.");
      }
      const result = await client.query(
        `insert into public.clients (id, workspace_id, name, contact, billable, currency)
         values ($1, $2, $3, $4, coalesce($5::boolean, false), $6)
         on conflict (id) do update set name = excluded.name, contact = excluded.contact,
           billable = coalesce($5::boolean, clients.billable),
           currency = coalesce(excluded.currency, clients.currency)
         where clients.workspace_id = excluded.workspace_id
         returning id::text`,
        [
          uuid(item.id),
          workspaceId,
          requiredText(item.name, "Client name", 160),
          optionalText(item.contact, "Client contact", 2_000) ?? "",
          item.billable ?? null,
          optionalCurrency(item.currency),
        ],
      );
      if (!result.rowCount) {
        throw new DataApiError(403, "A client identifier belongs to another workspace.");
      }
    }
    for (const project of data.projects ?? []) {
      if (!project || typeof project !== "object" || !Array.isArray(project.memberIds ?? [])) {
        throw new DataApiError(400, "Invalid project payload.");
      }
      const projectId = uuid(project.id);
      const projectName = requiredText(project.name, "Project name", 160).replace(/\s+/g, " ");
      if (!["active", "on-hold", "archived"].includes(project.status)) {
        throw new DataApiError(400, "Choose a valid project status.");
      }
      const clientId = uuid(project.clientId);
      await ensureProjectNameAvailable(client, workspaceId, clientId, projectName, projectId);
      const result = await client.query(
        `insert into public.projects (id, workspace_id, name, client_id, billable, status, color, last_activity)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set name = excluded.name, client_id = excluded.client_id, billable = excluded.billable, status = excluded.status, color = excluded.color, last_activity = excluded.last_activity
         where projects.workspace_id = excluded.workspace_id
         returning id::text`,
        [
          projectId,
          workspaceId,
          projectName,
          clientId,
          Boolean(project.billable),
          project.status,
          projectColorValue(project.color),
          dateValue(project.lastActivity),
        ],
      );
      if (!result.rowCount) {
        throw new DataApiError(403, "A project identifier belongs to another workspace.");
      }
      for (const memberId of project.memberIds ?? []) {
        if (membershipByUserId.get(memberId)?.status !== "active") {
          throw new DataApiError(400, "Only active members can be assigned to a project.");
        }
        await client.query(
          `insert into public.project_members (workspace_id, project_id, user_id) values ($1, $2, $3) on conflict do nothing`,
          [workspaceId, projectId, memberId],
        );
      }
    }
    await syncEntries(client, user.id, workspaceId, data.entries ?? []);
  }
  if (ownPreferences && hasActiveWorkspace) {
    const requestedWorkspaceId = ownPreferences.activeWorkspaceId
      ? uuid(ownPreferences.activeWorkspaceId)
      : null;
    const preferred = requestedWorkspaceId
      ? await client.query(
          `select 1
             from public.workspace_members wm
             join public.workspaces w on w.id = wm.workspace_id
            where wm.workspace_id = $1 and wm.user_id = $2
              and wm.status = 'active' and w.status = 'active'`,
          [requestedWorkspaceId, user.id],
        )
      : { rowCount: 0 };
    await client.query(
      `update public.user_preferences
          set active_workspace_id = $2, updated_at = now()
        where user_id = $1`,
      [user.id, preferred.rowCount ? requestedWorkspaceId : null],
    );
  }
  return obsoleteLogoPaths;
}

function timerFromRow(row) {
  return {
    status: row.status,
    workspaceId: row.workspace_id,
    task: row.task,
    projectId: row.project_id,
    billable: row.billable,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    startedDate: row.started_date,
    accumulated: row.accumulated_seconds,
    startClock: row.start_clock.slice(0, 5),
    ...(row.hourly_rate !== null ? { hourlyRate: numberValue(row.hourly_rate) } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
  };
}

async function requireInvitationManager(client, userId, workspaceId, targetRole) {
  const access = await requireWorkspaceAccess(client, userId, workspaceId);
  if (access.role !== "Owner" && access.role !== "Admin") {
    throw new DataApiError(403, "You do not have permission to manage invitations.");
  }
  if (targetRole === "Admin" && access.role !== "Owner") {
    throw new DataApiError(403, "Only the Owner can manage Admin invitations.");
  }
  return access;
}

function invitationRedirect(config, invitationId) {
  if (!config.appUrl)
    throw new DataApiError(500, "APP_URL is required to create invitation links.");
  let redirect;
  try {
    redirect = new URL("/invite/accept", config.appUrl);
  } catch {
    throw new DataApiError(500, "APP_URL is invalid.");
  }
  redirect.searchParams.set("invitation", invitationId);
  return redirect.toString();
}

async function invitationEmail(client, user, config, body, invitation) {
  const workspace = await client.query("select name from public.workspaces where id=$1", [
    invitation.workspace_id,
  ]);
  return await queueEmail(client, {
    key: body.emailOperationKey,
    kind: "invitation",
    userId: user.id,
    invitationId: invitation.id,
    recipient: invitation.email,
    payload: {
      workspace: workspace.rows[0].name,
      inviter: user.name || user.email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
      url: invitationRedirect(config, invitation.id),
    },
  });
}

async function processInvitationEmail(client, user, config, body, resend) {
  const workspaceId = uuid(body.workspaceId);
  const requestId = body.emailRequestId ? uuid(body.emailRequestId) : randomUUID();
  const emailOperationKey = `invitation:${user.id}:${workspaceId}:${resend ? "resend" : "create"}:${requestId}`;
  let result;
  await client.query("begin");
  try {
    await requireInvitationManager(client, user.id, workspaceId, "Member");
    await client.query("select id from public.workspaces where id=$1 for update", [workspaceId]);
    const previous = await client.query(
      `select e.id as email_id, i.id::text, i.workspace_id::text, i.email, i.role, i.invited_at, i.expires_at, i.status
      from public.transactional_emails e join public.workspace_invitations i on i.id=e.invitation_id where e.operation_key=$1`,
      [emailOperationKey],
    );
    if (previous.rows[0]) {
      const invitation = previous.rows[0];
      await requireInvitationManager(client, user.id, workspaceId, invitation.role);
      if (invitation.status !== "pending" || new Date(invitation.expires_at) <= new Date())
        throw new DataApiError(409, "This invitation is no longer pending.");
      result = {
        member: invitationMember(invitation),
        invitationUrl: invitationRedirect(config, invitation.id),
        emailId: invitation.email_id,
      };
    } else {
      result = await (resend ? resendInvitation : inviteMember)(client, user, config, {
        ...body,
        emailOperationKey,
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  const { emailId, ...invitation } = result;
  return { ...invitation, emailStatus: await deliverInvitation(client, config, emailId) };
}

async function inviteMember(client, user, config, body) {
  await ensureProfile(client, user, config);
  const workspaceId = uuid(body.workspaceId);
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const role = body.role === "Admin" ? "Admin" : body.role === "Member" ? "Member" : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) {
    throw new DataApiError(400, "Enter a valid invitation email and role.");
  }
  await requireInvitationManager(client, user.id, workspaceId, role);
  const existing = await client.query(
    `select 1
       from public.workspace_members wm
       join public.profiles p on p.id = wm.user_id
      where wm.workspace_id = $1 and lower(p.email) = $2
      limit 1`,
    [workspaceId, email],
  );
  if (existing.rowCount) {
    throw new DataApiError(409, "This email is already part of the team.");
  }
  await client.query(
    `update public.workspace_invitations
        set status = 'expired'
      where workspace_id = $1 and lower(email) = $2
        and status = 'pending' and expires_at <= now()`,
    [workspaceId, email],
  );
  const capacity = await client.query(
    `select
       (select count(*) from public.workspace_members where workspace_id = $1 and status <> 'removed')
       +
       (select count(*) from public.workspace_invitations where workspace_id = $1 and status = 'pending' and expires_at > now())
       as total`,
    [workspaceId],
  );
  if (numberValue(capacity.rows[0]?.total) >= 50) {
    throw new DataApiError(
      409,
      "This workspace has reached its limit of 50 members and invitations.",
    );
  }
  let inserted;
  try {
    inserted = await client.query(
      `insert into public.workspace_invitations (workspace_id, email, role, invited_by)
       values ($1, $2, $3, $4)
       returning id::text, workspace_id::text, email, role, invited_at, expires_at`,
      [workspaceId, email, role, user.id],
    );
  } catch (error) {
    if (error?.code === "23505") {
      throw new DataApiError(409, "This email already has a pending invitation.");
    }
    throw error;
  }
  const invitation = inserted.rows[0];
  return {
    member: invitationMember(invitation),
    invitationUrl: invitationRedirect(config, invitation.id),
    emailId: await invitationEmail(client, user, config, body, invitation),
  };
}

async function resendInvitation(client, user, config, body) {
  const workspaceId = uuid(body.workspaceId);
  const invitationId = uuid(body.invitationId);
  const result = await client.query(
    `select id::text, workspace_id::text, email, role, invited_at, expires_at
       from public.workspace_invitations
      where id = $1 and workspace_id = $2 and status = 'pending' and expires_at > now()`,
    [invitationId, workspaceId],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new DataApiError(404, "This invitation is no longer pending.");
  await requireInvitationManager(client, user.id, workspaceId, invitation.role);
  const updated = await client.query(
    `update public.workspace_invitations
        set invited_at = now(), expires_at = now() + interval '7 days'
      where id = $1
      returning id::text, workspace_id::text, email, role, invited_at, expires_at`,
    [invitationId],
  );
  return {
    member: invitationMember(updated.rows[0]),
    invitationUrl: invitationRedirect(config, invitationId),
    emailId: await invitationEmail(client, user, config, body, updated.rows[0]),
  };
}

async function cancelInvitation(client, user, body) {
  const workspaceId = uuid(body.workspaceId);
  const invitationId = uuid(body.invitationId);
  const result = await client.query(
    `select id::text, role
       from public.workspace_invitations
      where id = $1 and workspace_id = $2 and status = 'pending'`,
    [invitationId, workspaceId],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new DataApiError(404, "This invitation is no longer pending.");
  await requireInvitationManager(client, user.id, workspaceId, invitation.role);
  await client.query(`update public.workspace_invitations set status = 'cancelled' where id = $1`, [
    invitationId,
  ]);
  return null;
}

async function updateProfileName(client, user, config, body) {
  const name = requiredText(body.name, "Profile name", 120);
  await ensureProfile(client, user, config);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  await client.query(
    `update public.profiles
        set name = $2, initials = $3, updated_at = now()
      where id = $1`,
    [user.id, name, initials],
  );
  return null;
}

async function uploadAvatar(client, user, config, body) {
  const image = parseImageDataUrl(body.avatarDataUrl);
  if (!image || image.bytes.byteLength === 0) {
    throw new DataApiError(400, "Choose a valid profile photo.");
  }
  await ensureProfile(client, user, config);

  if (config.databaseProvider !== "supabase") {
    await updatePreferences(client, user, config, {
      patch: { avatarUrl: body.avatarDataUrl },
    });
    return body.avatarDataUrl;
  }

  const current = await client.query(`select avatar_path from public.profiles where id = $1`, [
    user.id,
  ]);
  const previousPath = current.rows[0]?.avatar_path ?? null;
  const extension =
    image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;
  const storage = getSupabaseAdmin(config).storage.from("avatars");
  const uploaded = await storage.upload(path, image.bytes, {
    contentType: image.contentType,
    upsert: false,
  });
  if (uploaded.error) throw new DataApiError(500, "Could not save the profile photo.");

  let signedUrl;
  try {
    signedUrl = await signedStorageUrl(config, "avatars", path);
    await client.query(
      `update public.profiles set avatar_path = $2, updated_at = now() where id = $1`,
      [user.id, path],
    );
    await client.query(
      `update public.user_preferences set avatar_data_url = null, updated_at = now() where user_id = $1`,
      [user.id],
    );
  } catch (error) {
    await storage.remove([path]);
    throw error;
  }

  if (previousPath && previousPath !== path) {
    const removed = await storage.remove([previousPath]);
    if (removed.error) console.error("Could not remove the previous profile photo.");
  }
  return signedUrl;
}

async function removeAvatar(client, user, config) {
  await ensureProfile(client, user, config);
  if (config.databaseProvider !== "supabase") {
    await updatePreferences(client, user, config, { patch: { avatarUrl: null } });
    return null;
  }

  const current = await client.query(`select avatar_path from public.profiles where id = $1`, [
    user.id,
  ]);
  const path = current.rows[0]?.avatar_path ?? null;
  await client.query(
    `update public.profiles set avatar_path = null, updated_at = now() where id = $1`,
    [user.id],
  );
  await client.query(
    `update public.user_preferences set avatar_data_url = null, updated_at = now() where user_id = $1`,
    [user.id],
  );
  if (!path) return null;

  const removed = await getSupabaseAdmin(config).storage.from("avatars").remove([path]);
  if (!removed.error) return null;
  await client.query(
    `update public.profiles set avatar_path = $2, updated_at = now() where id = $1`,
    [user.id, path],
  );
  throw new DataApiError(500, "Could not remove the profile photo.");
}

export async function acceptInvitation(client, user, config, body) {
  const invitationId = uuid(body.invitationId);
  await ensureProfile(client, user, config);
  const result = await client.query(
    `select invitation.id::text, invitation.workspace_id::text, invitation.email,
            invitation.role, invitation.status, invitation.invited_at, invitation.expires_at,
            invitation.auth_user_id, workspace.status as workspace_status
       from public.workspace_invitations invitation
       join public.workspaces workspace on workspace.id = invitation.workspace_id
      where invitation.id = $1
      for update of invitation`,
    [invitationId],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new DataApiError(404, "This invitation no longer exists.");
  if (invitation.workspace_status === "archived") {
    throw new DataApiError(409, "This workspace is archived.");
  }
  if (String(invitation.email).trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    throw new DataApiError(403, "This invitation belongs to a different email address.");
  }
  const existing = await client.query(
    `select 1 from public.workspace_members
      where workspace_id = $1 and user_id = $2 and status = 'active'`,
    [invitation.workspace_id, user.id],
  );
  if (
    invitation.status === "accepted" &&
    invitation.auth_user_id === user.id &&
    existing.rowCount
  ) {
    if (await hasColumn(client, "user_preferences", "active_workspace_id")) {
      await client.query(
        `update public.user_preferences
            set active_workspace_id = $2, updated_at = now()
          where user_id = $1`,
        [user.id, invitation.workspace_id],
      );
    }
    return { workspaceId: invitation.workspace_id };
  }
  if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
    throw new DataApiError(409, "This invitation is no longer valid.");
  }
  if (existing.rowCount) throw new DataApiError(409, "You already have access to this workspace.");

  await client.query(
    `insert into public.workspace_members (
       workspace_id, user_id, role, status, invited_at, joined_at
     ) values ($1, $2, $3, 'active', $4, now())
     on conflict (workspace_id, user_id) do update set
       role = excluded.role,
       status = 'active',
       invited_at = excluded.invited_at,
       joined_at = excluded.joined_at`,
    [invitation.workspace_id, user.id, invitation.role, invitation.invited_at],
  );
  await client.query(
    `update public.workspace_invitations
        set status = 'accepted', auth_user_id = $2, accepted_at = now()
      where id = $1`,
    [invitationId, user.id],
  );
  if (await hasColumn(client, "user_preferences", "active_workspace_id")) {
    await client.query(
      `update public.user_preferences set active_workspace_id = $2, updated_at = now() where user_id = $1`,
      [user.id, invitation.workspace_id],
    );
  }
  return { workspaceId: invitation.workspace_id };
}

async function updatePreferences(client, user, config, body) {
  const patch = body.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new DataApiError(400, "Invalid preferences payload.");
  }
  const allowedKeys = new Set([
    "idleDetection",
    "language",
    "theme",
    "avatarUrl",
    "timezone",
    "activeWorkspaceId",
    "reportFilters",
    "favoriteTasks",
  ]);
  if (Object.keys(patch).some((key) => !allowedKeys.has(key))) {
    throw new DataApiError(400, "Invalid preferences payload.");
  }
  await ensureProfile(client, user, config);
  const updates = [];
  const values = [user.id];
  const addValue = (column, value, cast = "") => {
    values.push(value);
    updates.push(`${column} = $${values.length}${cast}`);
  };
  if (patch.favoriteTasks !== undefined) {
    addValue("favorite_tasks", JSON.stringify(favoriteTasksValue(patch.favoriteTasks)), "::jsonb");
  }
  if (patch.idleDetection !== undefined) {
    if (typeof patch.idleDetection !== "boolean")
      throw new DataApiError(400, "Choose a valid idle detection preference.");
    addValue("idle_detection", patch.idleDetection);
  }
  if (patch.language !== undefined) {
    if (patch.language !== "en-US" && patch.language !== "pt-BR")
      throw new DataApiError(400, "Choose a valid language.");
    addValue("language", patch.language);
  }
  if (patch.theme !== undefined) {
    if (!["system", "light", "dark"].includes(patch.theme))
      throw new DataApiError(400, "Choose a valid theme.");
    addValue("theme", patch.theme);
  }
  if (patch.avatarUrl !== undefined) {
    if (!(await hasColumn(client, "user_preferences", "avatar_data_url"))) {
      throw new DataApiError(500, "Profile photo persistence is unavailable.");
    }
    const avatarUrl = avatarDataValue(patch.avatarUrl);
    if (patch.avatarUrl !== null && avatarUrl === null) {
      throw new DataApiError(400, "Choose a valid profile photo.");
    }
    addValue("avatar_data_url", avatarUrl);
  }
  if (patch.timezone !== undefined) {
    if (typeof patch.timezone !== "string" || !patch.timezone.trim())
      throw new DataApiError(400, "Choose a valid timezone.");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: patch.timezone }).format();
    } catch {
      throw new DataApiError(400, "Choose a valid timezone.");
    }
    addValue("timezone", patch.timezone);
  }
  if (
    patch.reportFilters !== undefined &&
    (await hasColumn(client, "user_preferences", "report_filters"))
  ) {
    if (
      !patch.reportFilters ||
      typeof patch.reportFilters !== "object" ||
      Array.isArray(patch.reportFilters)
    ) {
      throw new DataApiError(400, "Choose valid report filters.");
    }
    addValue("report_filters", reportFiltersJson(patch.reportFilters), "::jsonb");
  }
  if (
    patch.activeWorkspaceId !== undefined &&
    (await hasColumn(client, "user_preferences", "active_workspace_id"))
  ) {
    const workspaceId = patch.activeWorkspaceId === null ? null : uuid(patch.activeWorkspaceId);
    if (workspaceId) await requireWorkspaceAccess(client, user.id, workspaceId);
    addValue("active_workspace_id", workspaceId, "::uuid");
  }
  if (updates.length === 0) return null;
  await client.query(
    `update public.user_preferences
        set ${updates.join(", ")}, updated_at = now()
      where user_id = $1`,
    values,
  );
  return null;
}

async function operation(request, user, config, body) {
  config = { ...config, initialLanguage: body.initialLanguage === "pt-BR" ? "pt-BR" : "en-US" };
  const pool = getPool(config);
  const client = await pool.connect();
  let discardClient = false;
  try {
    requirePayloadUser(user, body ?? {});
    await ensureProfile(client, user, config);
    const operationName = String(body.operation ?? "");
    const includesUpload =
      (operationName === "syncAccount" &&
        Array.isArray(body.account?.workspaces) &&
        body.account.workspaces.some(
          (item) =>
            typeof item?.workspace?.logoDataUrl === "string" &&
            item.workspace.logoDataUrl.startsWith("data:image/"),
        )) ||
      (operationName === "createWorkspace" &&
        typeof body.logoDataUrl === "string" &&
        body.logoDataUrl.startsWith("data:image/"));
    await enforceUserRateLimits(client, user.id, operationName, new Date(), { includesUpload });
    await enforceAccountLifecycle(client, user.id, operationName);
    if (body.operation === "getAccountDeletionStatus") {
      return await getAccountDeletionStatus(client, user.id);
    }
    if (body.operation === "acceptLegalTerms") {
      return await acceptLegalTerms(client, user.id, body.locale);
    }
    if (body.operation === "exportAccountData") {
      return await exportAccountData(client, user);
    }
    if (body.operation === "requestAccountDeletion") {
      await client.query("begin");
      try {
        const requested = await requestAccountDeletion(client, user, body);
        await client.query("commit");
        return requested;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (body.operation === "cancelAccountDeletion") {
      await client.query("begin");
      try {
        const cancelled = await cancelAccountDeletion(client, user.id);
        await client.query("commit");
        return cancelled;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (body.operation === "transferWorkspaceOwnership") {
      await client.query("begin");
      try {
        const transferred = await transferWorkspaceOwnership(client, user.id, body);
        await client.query("commit");
        return transferred;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (body.operation === "loadAccount") {
      const account = await loadAccount(client, user, config);
      await welcomeOnAccess(client, user, config);
      return account;
    }
    if (body.operation === "loadReportEntries") return await loadReportEntries(client, user, body);
    if (body.operation === "updatePreferences")
      return await updatePreferences(client, user, config, body);
    if (body.operation === "createWorkspace") {
      await client.query("begin");
      try {
        const created = await createWorkspace(client, user, config, body);
        await client.query("commit");
        return created;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (body.operation === "inviteMember" || body.operation === "createInvitationLink")
      return await processInvitationEmail(client, user, config, body, false);
    if (body.operation === "resendInvitation")
      return await processInvitationEmail(client, user, config, body, true);
    if (body.operation === "cancelInvitation") return await cancelInvitation(client, user, body);
    if (body.operation === "updateProfileName")
      return await updateProfileName(client, user, config, body);
    if (body.operation === "uploadAvatar") return await uploadAvatar(client, user, config, body);
    if (body.operation === "removeAvatar") return await removeAvatar(client, user, config);
    if (body.operation === "acceptInvitation") {
      await client.query("begin");
      try {
        const accepted = await acceptInvitation(client, user, config, body);
        await client.query("commit");
        return accepted;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (body.operation === "syncAccount") {
      let obsoleteLogoPaths;
      await client.query("begin");
      try {
        obsoleteLogoPaths = await syncAccount(client, user, config, body.account);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      // Delete only after the new reference is committed. Cleanup failure must
      // not report a successful save as failed or remove the current image.
      if (obsoleteLogoPaths.length) {
        try {
          const { error } = await getSupabaseAdmin(config)
            .storage.from("workspace-logos")
            .remove(obsoleteLogoPaths);
          if (error) console.warn("Could not clean up replaced workspace logos.");
        } catch {
          console.warn("Could not clean up replaced workspace logos.");
        }
      }
      return null;
    }
    if (body.operation === "getActiveTimer") {
      const workspaceId = uuid(body.workspaceId);
      await requireWorkspaceAccess(client, user.id, workspaceId);
      const result = await client.query(
        `select user_id, workspace_id::text, status, task, project_id::text, billable, started_at, started_date::text, accumulated_seconds, start_clock::text, hourly_rate, currency from public.active_timers where user_id = $1 and workspace_id = $2`,
        [user.id, workspaceId],
      );
      return result.rows[0] ? timerFromRow(result.rows[0]) : null;
    }
    if (body.operation === "saveActiveTimer") {
      const timer = body.timer;
      if (!timer || typeof timer !== "object") {
        throw new DataApiError(400, "Invalid timer payload.");
      }
      const workspaceId = uuid(timer.workspaceId);
      const access = await requireWorkspaceAccess(client, user.id, workspaceId);
      if (timer.status !== "running" && timer.status !== "paused") {
        throw new DataApiError(400, "Invalid timer status.");
      }
      const task = requiredText(timer.task, "Task", 240);
      if (!timer.projectId) {
        throw new DataApiError(400, "Select a project before starting the timer.");
      }
      const accumulated = Number(timer.accumulated);
      if (!Number.isFinite(accumulated) || accumulated < 0 || accumulated > MAX_INTEGER_SECONDS) {
        throw new DataApiError(400, "The data payload contains an invalid timer duration.");
      }
      const hourlyRate = timer.hourlyRate === undefined ? null : Number(timer.hourlyRate);
      if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
        throw new DataApiError(400, "The data payload contains an invalid hourly rate.");
      }
      let startedAt = null;
      try {
        startedAt = timer.startedAt ? new Date(timer.startedAt).toISOString() : null;
      } catch {
        throw new DataApiError(400, "The data payload contains an invalid timer timestamp.");
      }
      if (
        (timer.status === "running" && startedAt === null) ||
        (timer.status === "paused" && startedAt !== null)
      ) {
        throw new DataApiError(400, "The data payload contains an invalid timer state.");
      }
      if (timer.projectId) {
        const projectId = uuid(timer.projectId);
        const project = await client.query(
          `select p.status,
                  exists (
                    select 1 from public.project_members pm
                    where pm.project_id = p.id and pm.workspace_id = p.workspace_id and pm.user_id = $2
                  ) as assigned
             from public.projects p
            where p.id = $1 and p.workspace_id = $3`,
          [projectId, user.id, workspaceId],
        );
        if (!project.rows[0]) throw new DataApiError(400, "This project no longer exists.");
        if (project.rows[0].status !== "active") {
          throw new DataApiError(400, "This project cannot be used for a timer.");
        }
        if (access.role === "Member" && !project.rows[0].assigned) {
          throw new DataApiError(403, "This project is not assigned to your team member.");
        }
      }
      const result = await client.query(
        `insert into public.active_timers (user_id, workspace_id, status, task, project_id, billable, started_at, started_date, accumulated_seconds, start_clock, hourly_rate, currency) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict (user_id, workspace_id) do update set status = excluded.status, task = excluded.task, project_id = excluded.project_id, billable = excluded.billable, started_at = excluded.started_at, started_date = excluded.started_date, accumulated_seconds = excluded.accumulated_seconds, start_clock = excluded.start_clock, hourly_rate = excluded.hourly_rate, currency = excluded.currency, updated_at = now() returning user_id, workspace_id::text, status, task, project_id::text, billable, started_at, started_date::text, accumulated_seconds, start_clock::text, hourly_rate, currency`,
        [
          user.id,
          workspaceId,
          timer.status,
          task,
          timer.projectId ? uuid(timer.projectId) : null,
          Boolean(timer.billable),
          startedAt,
          timer.startedDate ? dateValue(timer.startedDate) : null,
          Math.floor(accumulated),
          timeValue(timer.startClock),
          hourlyRate,
          optionalCurrency(timer.currency),
        ],
      );
      return timerFromRow(result.rows[0]);
    }
    if (body.operation === "clearActiveTimer") {
      const workspaceId = uuid(body.workspaceId);
      await requireWorkspaceAccess(client, user.id, workspaceId, true);
      await client.query(
        `delete from public.active_timers where user_id = $1 and workspace_id = $2`,
        [user.id, workspaceId],
      );
      return null;
    }
    throw new DataApiError(400, "Unsupported data operation.");
  } catch (error) {
    discardClient = isDatabaseConnectionFailure(error);
    throw error;
  } finally {
    // A severed Neon connection must not return to the pool and poison the
    // next request. Validation and application errors keep the client reusable.
    client.release(discardClient);
  }
}

function isDatabaseConnectionFailure(error) {
  if (!(error instanceof Error)) return false;
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  return (
    ["ECONNRESET", "EPIPE", "ETIMEDOUT", "ENOTFOUND", "57P01", "57P02", "57P03"].includes(code) ||
    /connection terminated|connection closed|socket hang up|\baborted\b/i.test(error.message)
  );
}

export async function readBody(request) {
  const declaredLength = Number(request.headers?.["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new DataApiError(413, "The request body is too large.");
  }
  if (request.body && typeof request.body === "object") {
    const serialized = JSON.stringify(request.body);
    if (Buffer.byteLength(serialized, "utf8") > MAX_REQUEST_BODY_BYTES) {
      throw new DataApiError(413, "The request body is too large.");
    }
    return request.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BODY_BYTES) {
      throw new DataApiError(413, "The request body is too large.");
    }
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new DataApiError(400, "The request body must be valid JSON.");
  }
}

function sendJson(response, status, payload, requestId, retryAfter) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store, private");
  response.setHeader("x-request-id", requestId);
  if (retryAfter) response.setHeader("retry-after", String(retryAfter));
  response.end(JSON.stringify(payload));
}

function validateRequestOrigin(request, config) {
  const origin = String(request.headers?.origin ?? "").trim();
  if (!origin) return;
  let expectedOrigin = "";
  try {
    expectedOrigin = new URL(config.appUrl).origin;
  } catch {
    throw new DataApiError(500, "APP_URL is not configured correctly.");
  }
  if (origin !== expectedOrigin) {
    throw new DataApiError(403, "This request origin is not allowed.", {
      code: "invalid_origin",
    });
  }
}

export async function handleDataRequest(request, response, env = {}) {
  const requestId = randomUUID();
  let operationName = "unknown";
  response.setHeader("x-request-id", requestId);
  const method = String(request.method ?? "").toUpperCase();
  try {
    enforceIpBurstLimit(request);
    const config = providerEnv(env);
    validateRequestOrigin(request, config);
    if (method === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("cache-control", "no-store, private");
      response.end();
      return;
    }
    if (method !== "POST") {
      response.setHeader("allow", "POST, OPTIONS");
      sendJson(response, 405, { error: "Method not allowed.", requestId }, requestId);
      return;
    }
    const contentType = String(request.headers?.["content-type"] ?? "").toLowerCase();
    if (contentType && !contentType.startsWith("application/json")) {
      throw new DataApiError(415, "The request content type must be application/json.");
    }
    const user = await authenticateDataRequest(request, config, getPool);
    const body = await readBody(request);
    operationName = String(body.operation ?? "unknown");
    const data = await operation(request, user, config, body);
    sendJson(response, 200, { data, requestId }, requestId);
  } catch (error) {
    const isProjectNameConflict =
      error?.code === "23505" && error?.constraint === "projects_workspace_client_name_idx";
    const internalMessage = isProjectNameConflict
      ? "A project with this name already exists for this client."
      : error instanceof Error && error.message.trim()
        ? error.message
        : "The data request failed.";
    const status = isProjectNameConflict ? 409 : error instanceof DataApiError ? error.status : 500;
    const publicMessage =
      status < 500
        ? internalMessage
        : "The data service is temporarily unavailable. Please try again.";
    console.error("[trackify data api]", {
      requestId,
      name: error instanceof Error ? error.name : typeof error,
      message: sanitizeTelemetry(internalMessage),
      code: error?.code,
    });
    if (status >= 500) {
      captureServerError(
        error,
        { requestId, operation: operationName, status },
        { ...process.env, ...env },
      );
    }
    sendJson(
      response,
      status,
      { error: publicMessage, code: error?.code, requestId },
      requestId,
      error instanceof DataApiError ? error.retryAfter : undefined,
    );
  }
}

export function createDataMiddleware(env = {}) {
  return (request, response) => void handleDataRequest(request, response, env);
}
