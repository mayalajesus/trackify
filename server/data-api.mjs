import { randomUUID } from "node:crypto";
import {
  acceptLegalTerms,
  cancelAccountDeletion,
  enforceAccountLifecycle,
  exportAccountData,
  getAccountDeletionStatus,
  requestAccountDeletion,
  transferWorkspaceOwnership,
} from "./account-lifecycle.mjs";
import { authenticateDataRequest } from "./authentication.mjs";
import { DataApiError } from "./data-api-error.mjs";
import { requirePayloadUser, requireWorkspaceAccess } from "./data/access.mjs";
import { loadAccount } from "./data/account.mjs";
import { getPool, getSupabaseAdmin, providerEnv } from "./data/connections.mjs";
import { loadReportEntries } from "./data/entries.mjs";
import {
  acceptInvitation,
  cancelInvitation,
  listPendingInvitations,
  processInvitationEmail,
} from "./data/invitations.mjs";
import {
  removeAvatar,
  updatePreferences,
  updateProfileName,
  uploadAvatar,
} from "./data/preferences.mjs";
import { ensureProfile } from "./data/profile.mjs";
import { deleteMember } from "./data/members.mjs";
import { syncAccount } from "./data/sync-account.mjs";
import {
  timerFromRow,
  timerWithOwner,
  syncSharedTimers,
  clearOwnTimer,
  requireSharedTimerSource,
} from "./data/timer.mjs";
import {
  dateValue,
  MAX_INTEGER_SECONDS,
  optionalCurrency,
  requiredText,
  timeValue,
  uuid,
} from "./data/validation.mjs";
import { createWorkspace } from "./data/workspaces.mjs";
import { deleteWorkspace } from "./data/delete-workspace.mjs";
import { enforceExtensionOperation, isAllowedExtensionOrigin } from "./extension-origin.mjs";
import { extensionContext, extensionTimerAction } from "./data/extension.mjs";
import {
  captureServerError,
  initializeServerObservability,
  sanitizeTelemetry,
} from "./observability.mjs";
import { enforceIpBurstLimit, enforceUserRateLimits } from "./rate-limit.mjs";
import { handleTaskAction, taskDetailsValue } from "./task-actions.mjs";
import { welcomeOnAccess } from "./transactional-emails.mjs";

// Initialize before the first request so server-side tracing can instrument the
// whole invocation. The helper is a no-op when SENTRY_DSN is not configured.
initializeServerObservability();
export { providerEnv } from "./data/connections.mjs";

export { getSupabaseAdmin } from "./data/connections.mjs";

export { getPool } from "./data/connections.mjs";

export { loadAccount } from "./data/account.mjs";

export { createWorkspace } from "./data/workspaces.mjs";

export { upsertOwnEntry } from "./data/entries.mjs";

export { syncEntries } from "./data/entries.mjs";

export { acceptInvitation, listPendingInvitations } from "./data/invitations.mjs";

const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

async function operation(request, user, config, body) {
  config = { ...config, initialLanguage: body.initialLanguage === "en-US" ? "en-US" : "pt-BR" };
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
    if (body.operation === "getExtensionSession") {
      return { version: 1, user: { id: user.id, name: user.name ?? "", email: user.email } };
    }
    if (body.operation === "getExtensionContext") return await extensionContext(client, user, body);
    if (body.operation === "extensionTimerAction")
      return await extensionTimerAction(client, user, body);
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
    if (
      [
        "inviteToTask",
        "listTaskInvitations",
        "listTaskInvitationResponses",
        "respondTaskInvitation",
        "listTaskParticipants",
      ].includes(body.operation)
    )
      return await handleTaskAction(client, user, body, {
        requireWorkspaceAccess,
        uuid,
        timerFromRow,
      });
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
    if (body.operation === "listPendingInvitations")
      return await listPendingInvitations(client, user);
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
    if (body.operation === "deleteWorkspace") {
      await client.query("begin");
      try {
        await deleteWorkspace(client, user, body);
        const account = await loadAccount(client, user, config);
        await client.query("commit");
        return account;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (body.operation === "deleteMember") {
      await client.query("begin");
      try {
        const result = await deleteMember(client, user, body);
        await client.query("commit");
        return result;
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
        `select user_id, workspace_id::text, status, task, project_id::text, billable, started_at, started_date::text, accumulated_seconds, start_clock::text, hourly_rate, currency, task_details from public.active_timers where user_id = $1 and workspace_id = $2`,
        [user.id, workspaceId],
      );
      return result.rows[0]
        ? await timerWithOwner(client, user.id, workspaceId, result.rows[0])
        : null;
    }
    if (body.operation === "saveActiveTimer") {
      const timer = body.timer;
      if (!timer || typeof timer !== "object") {
        throw new DataApiError(400, "Invalid timer payload.");
      }
      const workspaceId = uuid(timer.workspaceId);
      await requireWorkspaceAccess(client, user.id, workspaceId);
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
          `select p.status
             from public.projects p
            where p.id = $1 and p.workspace_id = $2`,
          [projectId, workspaceId],
        );
        if (!project.rows[0]) throw new DataApiError(400, "This project no longer exists.");
        if (project.rows[0].status !== "active") {
          throw new DataApiError(400, "This project cannot be used for a timer.");
        }
      }
      await client.query("begin");
      try {
        await client.query("select id from public.workspaces where id=$1 for update", [
          workspaceId,
        ]);
        const sharedTimer = await client.query(
          `select t.*,t.workspace_id::text,t.project_id::text,t.started_date::text,t.start_clock::text
             from public.active_timers t where t.workspace_id=$1 and t.user_id=$2
             and exists (select 1 from public.task_invitations i where i.workspace_id=t.workspace_id
               and i.recipient_id=t.user_id and i.status='accepted' and i.invited_by<>t.user_id
               and i.task_id::text=t.task_details->>'id')`,
          [workspaceId, user.id],
        );
        if (sharedTimer.rows[0]) {
          const canonical = await timerWithOwner(client, user.id, workspaceId, sharedTimer.rows[0]);
          await client.query("commit");
          return canonical;
        }
        await requireSharedTimerSource(client, user.id, workspaceId, timer.taskDetails?.id);
        const result = await client.query(
          `insert into public.active_timers (user_id, workspace_id, status, task, project_id, billable, started_at, started_date, accumulated_seconds, start_clock, hourly_rate, currency, task_details) values ($1, $2, $3, $4, $5,
          coalesce((select p.billable or coalesce(c.billable, false) from public.projects p
            left join public.clients c on c.id = p.client_id and c.workspace_id = p.workspace_id
            where p.id = $5 and p.workspace_id = $2), false), $6, $7, $8, $9, $10, $11, $12) on conflict (user_id, workspace_id) do update set status = excluded.status, task = excluded.task, project_id = excluded.project_id, billable = excluded.billable, started_at = excluded.started_at, started_date = excluded.started_date, accumulated_seconds = excluded.accumulated_seconds, start_clock = excluded.start_clock, hourly_rate = excluded.hourly_rate, currency = excluded.currency, task_details = excluded.task_details, updated_at = now()
        where active_timers.task_details->>'id' = excluded.task_details->>'id'
          or not exists (
            select 1 from public.task_invitations i
            where i.workspace_id=active_timers.workspace_id and i.recipient_id=active_timers.user_id
              and i.task_id::text=active_timers.task_details->>'id' and i.status='accepted'
              and i.invited_by<>active_timers.user_id
          ) returning user_id, workspace_id::text, status, task, project_id::text, billable, started_at, started_date::text, accumulated_seconds, start_clock::text, hourly_rate, currency, task_details`,
          [
            user.id,
            workspaceId,
            timer.status,
            task,
            timer.projectId ? uuid(timer.projectId) : null,
            startedAt,
            timer.startedDate ? dateValue(timer.startedDate) : null,
            Math.floor(accumulated),
            timeValue(timer.startClock),
            hourlyRate,
            optionalCurrency(timer.currency),
            taskDetailsValue(timer.taskDetails),
          ],
        );
        if (!result.rows[0])
          throw new DataApiError(403, "Only the person who started this shared task can stop it.");
        const saved = await timerWithOwner(client, user.id, workspaceId, result.rows[0]);
        await syncSharedTimers(client, user.id, workspaceId);
        await client.query("commit");
        return saved;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (body.operation === "clearActiveTimer") {
      const workspaceId = uuid(body.workspaceId);
      await requireWorkspaceAccess(client, user.id, workspaceId, true);
      await clearOwnTimer(client, user.id, workspaceId);
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
  if (isAllowedExtensionOrigin(origin, config.extensionIds)) return;
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
    const origin = String(request.headers?.origin ?? "").trim();
    if (isAllowedExtensionOrigin(origin, config.extensionIds)) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "Origin");
      response.setHeader("access-control-allow-methods", "POST, OPTIONS");
      response.setHeader("access-control-allow-headers", "authorization, content-type");
    }
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
    enforceExtensionOperation(origin, operationName);
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
