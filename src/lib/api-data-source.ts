import { networkErrorMessage, offlineMessage } from "./network-errors";
import type { Session } from "@supabase/supabase-js";
import { getAuthClient } from "./auth-client";
import { defaultLocale } from "./i18n";
import type {
  AccountDataSource,
  AccountDeletionStatus,
  AccountExport,
  CreateWorkspaceResult,
  DataSourceResult,
  InvitationLink,
  PendingWorkspaceInvitation,
  ReportEntriesQuery,
} from "./account-data-source";
import type { TimeEntry } from "./domain";
import type { PersistedAccount } from "./account-types";
import type { TimerState } from "./store";

const apiBaseUrl = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/$/, "");
const endpoint = `${apiBaseUrl}/api/data`;

function fail<T>(
  error: string,
  metadata: { code?: string; retryAfter?: number; requestId?: string } = {},
): DataSourceResult<T> {
  return { success: false, error: networkErrorMessage(error), ...metadata };
}

function ok<T>(data: T): DataSourceResult<T> {
  return { success: true, data };
}

async function session(): Promise<DataSourceResult<Session>> {
  try {
    const authClient = await getAuthClient();
    if (!authClient) return fail("Authentication is currently unavailable.");
    const response = await authClient.getSession();
    if (response.error) return fail(response.error.message);
    if (!response.data.session) return fail("Authentication is required.");
    return ok(response.data.session);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The session request failed.");
  }
}

async function token(currentSession: Session): Promise<string> {
  const authClient = await getAuthClient();
  const sessionToken = (await authClient?.getJWTToken?.()) ?? "";
  if (sessionToken) return sessionToken;
  if (currentSession.access_token) return currentSession.access_token;
  throw new Error("Your authentication session is unavailable.");
}

export async function request<T>(
  operation: string,
  payload: Record<string, unknown> = {},
): Promise<DataSourceResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return fail(offlineMessage);
  const currentSession = await session();
  if (!currentSession.success) return fail<T>(currentSession.error);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await token(currentSession.data)}`,
      },
      body: JSON.stringify({ operation, ...payload, initialLanguage: defaultLocale }),
    });
    const body = (await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    })) as {
      data?: T;
      error?: string;
      code?: string;
      requestId?: string;
    } | null;
    const message = body?.error?.trim() || `The data request failed (${response.status}).`;
    const retryAfter = Number(response.headers.get("retry-after"));
    const requestId = body?.requestId || response.headers.get("x-request-id") || "";
    const metadata = {
      ...(body?.code ? { code: body.code } : {}),
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
      ...(requestId ? { requestId } : {}),
    };
    if (!response.ok) return fail(message, metadata);
    if (body?.error) return fail(message, metadata);
    if (!body || !("data" in body))
      return fail("The server returned an invalid response.", metadata);
    return ok(body.data as T);
  } catch (error) {
    return fail(
      error instanceof DOMException && error.name === "AbortError"
        ? "The data request timed out."
        : error instanceof Error
          ? error.message
          : "The data request failed.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export function createApiDataSource(): AccountDataSource {
  return {
    loadAccount: () => request<PersistedAccount>("loadAccount"),
    loadReportEntries: (userId: string, query: ReportEntriesQuery) =>
      request<TimeEntry[]>("loadReportEntries", { userId, ...query }),
    syncAccount: (_userId, account) => request<null>("syncAccount", { account }),
    updatePreferences: (userId, patch) => request<null>("updatePreferences", { userId, patch }),
    createWorkspace: (input) => request<CreateWorkspaceResult>("createWorkspace", { ...input }),
    deleteWorkspace: (workspaceId, confirmation) =>
      request<PersistedAccount>("deleteWorkspace", { workspaceId, confirmation }),
    getActiveTimer: (_userId, workspaceId) =>
      request<TimerState | null>("getActiveTimer", { workspaceId }),
    saveActiveTimer: (_userId, timer) => request<TimerState>("saveActiveTimer", { timer }),
    clearActiveTimer: (_userId, workspaceId) => request<null>("clearActiveTimer", { workspaceId }),
    inviteMember: (workspaceId, email, role) =>
      request<InvitationLink>("createInvitationLink", {
        workspaceId,
        email,
        role,
        emailRequestId: crypto.randomUUID(),
      }),
    resendInvitation: (workspaceId, invitationId) =>
      request<InvitationLink>("resendInvitation", {
        workspaceId,
        invitationId,
        emailRequestId: crypto.randomUUID(),
      }),
    deleteMember: (workspaceId, memberId) =>
      request<{ deletedAt: string }>("deleteMember", { workspaceId, memberId }),
    cancelInvitation: (workspaceId, invitationId) =>
      request<null>("cancelInvitation", { workspaceId, invitationId }),
    updateProfileName: (name) => request<null>("updateProfileName", { name }),
    uploadAvatar: (avatarDataUrl) => request<string>("uploadAvatar", { avatarDataUrl }),
    removeAvatar: () => request<null>("removeAvatar"),
    acceptInvitation: (invitationId) =>
      request<{ workspaceId: string }>("acceptInvitation", { invitationId }),
    listPendingInvitations: () => request<PendingWorkspaceInvitation[]>("listPendingInvitations"),
    getAccountDeletionStatus: () => request<AccountDeletionStatus>("getAccountDeletionStatus"),
    acceptLegalTerms: (locale) => request<AccountDeletionStatus>("acceptLegalTerms", { locale }),
    transferWorkspaceOwnership: (workspaceId, targetUserId) =>
      request<{ workspaceId: string; ownerId: string }>("transferWorkspaceOwnership", {
        workspaceId,
        targetUserId,
      }),
    exportAccountData: () => request<AccountExport>("exportAccountData"),
    requestAccountDeletion: (confirmation) =>
      request<AccountDeletionStatus["deletion"]>("requestAccountDeletion", { confirmation }),
    cancelAccountDeletion: () => request<null>("cancelAccountDeletion"),
  };
}
