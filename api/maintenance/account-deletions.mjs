import { randomUUID } from "node:crypto";
import { processDueAccountDeletions } from "../../server/account-lifecycle.mjs";
import { getPool, getSupabaseAdmin, providerEnv } from "../../server/data-api.mjs";
import { captureServerError } from "../../server/observability.mjs";
import { hasBearerSecret } from "../../server/request-security.mjs";

function send(response, status, requestId, payload) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store, private");
  response.setHeader("x-request-id", requestId);
  response.end(JSON.stringify({ ...payload, requestId }));
}

export default async function handler(request, response) {
  const requestId = randomUUID();
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    send(response, 405, requestId, { error: "Method not allowed." });
    return;
  }
  if (!hasBearerSecret(request, process.env.CRON_SECRET || "")) {
    send(response, 401, requestId, { error: "Authentication is required." });
    return;
  }
  try {
    const config = providerEnv(process.env);
    const admin = config.databaseProvider === "supabase" ? getSupabaseAdmin(config) : null;
    const result = await processDueAccountDeletions(getPool(config), admin, 25);
    send(response, 200, requestId, { status: "ok", ...result });
  } catch (error) {
    console.error("[trackify account deletion maintenance]", {
      requestId,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : "Maintenance failed",
    });
    captureServerError(error, {
      requestId,
      operation: "account-deletion-maintenance",
      status: 500,
    });
    send(response, 500, requestId, { error: "Maintenance is temporarily unavailable." });
  }
}
