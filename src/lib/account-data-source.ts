import type { PersistedAccount, UserPreferences } from "./account-types";
import type { CurrencyCode } from "./billing";
import type { TimerState } from "./store";
import type { Member, Role, TimeEntry } from "./domain";

export type RateLimitResponse = {
  code: "rate_limit_exceeded";
  retryAfter: number;
  requestId: string;
};

export type DataSourceResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      code?: string;
      retryAfter?: number;
      requestId?: string;
    };

export type ReportEntriesQuery = {
  workspaceId: string;
  startDate: string;
  endDate: string;
};

export type InvitationEmailStatus =
  "disabled" | "pending" | "sending" | "accepted" | "failed" | "unknown" | "skipped";
export type InvitationLink = {
  member: Member;
  invitationUrl: string;
  emailStatus: InvitationEmailStatus;
};
export type PendingWorkspaceInvitation = { id: string; workspaceName: string };
export type CreateWorkspaceInput = {
  name: string;
  logoDataUrl?: string | null;
  hourlyRate: number;
  currency: CurrencyCode;
};
export type CreateWorkspaceResult = { workspaceId: string; account: PersistedAccount };

export type AccountDeletionStatus = {
  accountStatus: "active" | "deletion_pending";
  legal: {
    accepted: boolean;
    termsVersion: string;
    privacyVersion: string;
    acceptedAt: string | null;
  };
  deletion: null | {
    id: string;
    status: "pending" | "cancelled" | "processing" | "completed" | "failed";
    requestedAt: string;
    executeAfter: string;
    cancelledAt: string | null;
    completedAt: string | null;
  };
  ownershipBlockers: Array<{
    workspaceId: string;
    workspaceName: string;
    otherActiveMembers: number;
  }>;
};

export type AccountExport = {
  version: 1;
  exportedAt: string;
  profile: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  memberships: Array<Record<string, unknown>>;
  invitations: Array<Record<string, unknown>>;
  timeEntries: Array<Record<string, unknown>>;
};

export interface AccountDataSource {
  loadAccount(userId: string): Promise<DataSourceResult<PersistedAccount>>;
  loadReportEntries(
    userId: string,
    query: ReportEntriesQuery,
  ): Promise<DataSourceResult<TimeEntry[]>>;
  syncAccount(userId: string, account: PersistedAccount): Promise<DataSourceResult<null>>;
  updatePreferences(
    userId: string,
    patch: Partial<UserPreferences>,
  ): Promise<DataSourceResult<null>>;
  createWorkspace(input: CreateWorkspaceInput): Promise<DataSourceResult<CreateWorkspaceResult>>;
  getActiveTimer(userId: string, workspaceId: string): Promise<DataSourceResult<TimerState | null>>;
  saveActiveTimer(userId: string, timer: TimerState): Promise<DataSourceResult<TimerState>>;
  clearActiveTimer(userId: string, workspaceId: string): Promise<DataSourceResult<null>>;
  inviteMember(
    workspaceId: string,
    email: string,
    role: Exclude<Role, "Owner">,
  ): Promise<DataSourceResult<InvitationLink>>;
  resendInvitation(
    workspaceId: string,
    invitationId: string,
  ): Promise<DataSourceResult<InvitationLink>>;
  cancelInvitation(workspaceId: string, invitationId: string): Promise<DataSourceResult<null>>;
  updateProfileName(name: string): Promise<DataSourceResult<null>>;
  uploadAvatar(avatarDataUrl: string): Promise<DataSourceResult<string>>;
  removeAvatar(): Promise<DataSourceResult<null>>;
  acceptInvitation(invitationId: string): Promise<DataSourceResult<{ workspaceId: string }>>;
  listPendingInvitations(): Promise<DataSourceResult<PendingWorkspaceInvitation[]>>;
  getAccountDeletionStatus(): Promise<DataSourceResult<AccountDeletionStatus>>;
  acceptLegalTerms(locale: "pt-BR" | "en-US"): Promise<DataSourceResult<AccountDeletionStatus>>;
  transferWorkspaceOwnership(
    workspaceId: string,
    targetUserId: string,
  ): Promise<DataSourceResult<{ workspaceId: string; ownerId: string }>>;
  exportAccountData(): Promise<DataSourceResult<AccountExport>>;
  requestAccountDeletion(
    confirmation: string,
  ): Promise<DataSourceResult<AccountDeletionStatus["deletion"]>>;
  cancelAccountDeletion(): Promise<DataSourceResult<null>>;
}
