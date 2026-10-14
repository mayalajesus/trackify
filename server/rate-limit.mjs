import { DataApiError } from "./data-api-error.mjs";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const IP_BURST_LIMIT = 240;
const MAX_IP_BUCKETS = 2_000;
const ipBuckets = new Map();

const READ_OPERATIONS = new Set([
  "loadAccount",
  "loadReportEntries",
  "getActiveTimer",
  "getAccountDeletionStatus",
  "listTaskInvitationResponses",
]);
const SENSITIVE_OPERATIONS = new Set([
  "createWorkspace",
  "deleteWorkspace",
  "inviteMember",
  "createInvitationLink",
  "resendInvitation",
  "uploadAvatar",
]);

export function rateLimitScopes(operation, options = {}) {
  const scopes = [{ scope: "general", limit: 180, windowMs: MINUTE_MS }];
  if (READ_OPERATIONS.has(operation)) {
    scopes.push({ scope: "read", limit: 120, windowMs: MINUTE_MS });
  }
  if (operation === "syncAccount") {
    scopes.push({ scope: "sync", limit: 30, windowMs: MINUTE_MS });
  }
  if (SENSITIVE_OPERATIONS.has(operation) || options.includesUpload === true) {
    scopes.push({ scope: "sensitive", limit: 10, windowMs: HOUR_MS });
  }
  if (operation === "exportAccountData") {
    scopes.push({ scope: "export", limit: 2, windowMs: HOUR_MS });
  }
  return scopes;
}

export function requestIp(request) {
  const forwarded = String(request.headers?.["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

export function enforceIpBurstLimit(request, now = Date.now()) {
  const ip = requestIp(request);
  const current = ipBuckets.get(ip);
  if (!current && ipBuckets.size >= MAX_IP_BUCKETS) {
    for (const [key, value] of ipBuckets) {
      if (now - value.startedAt >= MINUTE_MS) ipBuckets.delete(key);
    }
    while (ipBuckets.size >= MAX_IP_BUCKETS) {
      const oldestKey = ipBuckets.keys().next().value;
      if (oldestKey === undefined) break;
      ipBuckets.delete(oldestKey);
    }
  }
  const bucket =
    !current || now - current.startedAt >= MINUTE_MS
      ? { startedAt: now, count: 1 }
      : { ...current, count: current.count + 1 };
  ipBuckets.set(ip, bucket);

  if (bucket.count > IP_BURST_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((MINUTE_MS - (now - bucket.startedAt)) / 1_000));
    throw new DataApiError(429, "Too many requests. Please try again shortly.", {
      code: "rate_limit_exceeded",
      retryAfter,
    });
  }
}

export async function enforceUserRateLimits(
  client,
  userId,
  operation,
  now = new Date(),
  options = {},
) {
  for (const { scope, limit, windowMs } of rateLimitScopes(operation, options)) {
    const result = await client.query(
      `insert into public.api_rate_limits
         (user_id, scope, window_started_at, request_count, updated_at)
       values ($1, $2, $3, 1, now())
       on conflict (user_id, scope) do update
         set window_started_at = case
               when public.api_rate_limits.window_started_at <= $3 - ($4 * interval '1 millisecond')
                 then $3
               else public.api_rate_limits.window_started_at
             end,
             request_count = case
               when public.api_rate_limits.window_started_at <= $3 - ($4 * interval '1 millisecond')
                 then 1
               else public.api_rate_limits.request_count + 1
             end,
             updated_at = now()
       returning request_count, window_started_at`,
      [userId, scope, now.toISOString(), windowMs],
    );
    const row = result.rows[0];
    if (Number(row.request_count) > limit) {
      const startedAt = new Date(row.window_started_at).getTime();
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now.getTime() - startedAt)) / 1_000));
      throw new DataApiError(429, "Too many requests. Please try again shortly.", {
        code: "rate_limit_exceeded",
        retryAfter,
      });
    }
  }
}

export function resetIpRateLimitsForTests() {
  ipBuckets.clear();
}
