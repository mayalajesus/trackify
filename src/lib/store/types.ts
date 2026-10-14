import type {
  SessionStatus,
  UserPreferences,
  Workspace,
  WorkspaceMembership,
  WorkspaceSettings,
  WorkspaceSummary,
} from "../account-types";
import { type BillingPreference, type CurrencyCode } from "../billing";
import type { Client, Member, Project, Role, TimeEntry, TrelloState } from "../domain";
import { type Permission } from "../permissions";
import { type TimerTaskPreset } from "../timer-start";

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerState {
  collaborationOwnerId?: string;
  taskDetails?: import("../domain").TaskDetails;
  status: TimerStatus;
  workspaceId: string | null;
  task: string;
  projectId: string | null;
  billable: boolean;
  startedAt: number | null;
  startedDate: string | null;
  accumulated: number;
  startClock: string;
  hourlyRate?: number;
  currency?: CurrencyCode;
}

export type StoreResult =
  | {
      success: true;
      id?: string;
      invitationUrl?: string;
      emailStatus?: import("../account-data-source").InvitationEmailStatus;
      warning?: string;
      conflict?: TimeEntry;
    }
  | { success: false; error: string };

export type AddEntryOptions = {
  allowWhileTimerActive?: boolean;
  refreshBilling?: boolean;
};

export interface StoreValue {
  entries: TimeEntry[];
  projects: Project[];
  clients: Client[];
  members: Member[];
  timer: TimerState;
  recentTasks: TimerTaskPreset[];
  trello: TrelloState;
  settings: WorkspaceSettings;
  preferences: UserPreferences;
  preferencesByUserId: Record<string, UserPreferences>;
  workspaceBilling: BillingPreference;
  billingPreferencesByUserId: Record<string, BillingPreference>;
  currentMember: Member | null;
  currentWorkspace: Workspace | null;
  currentWorkspaceMembership: WorkspaceMembership | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  sessionStatus: SessionStatus;
  accountLoading: boolean;
  accountError: string | null;
  retryAccountLoad: () => void;
  can: (permission: Permission) => boolean;
  canTrackProject: (projectId: string) => boolean;
  findEntryConflict: (
    entry: Omit<TimeEntry, "id">,
    excludedEntryId?: string,
  ) => TimeEntry | undefined;
  setActiveMember: (memberId: string) => StoreResult;
  currentUserId: string;
  today: string;
  startTimer: (
    task: string,
    projectId: string | null,
    billable?: boolean,
    taskDetails?: import("../domain").TaskDetails,
  ) => StoreResult;
  acceptTaskInvitation: (invitationId: string) => Promise<StoreResult>;
  startTimerFromTask: (task: TimerTaskPreset) => StoreResult;
  updateTimer: (patch: {
    taskDetails?: import("../domain").TaskDetails;
    task?: string;
    projectId?: string | null;
    billable?: boolean;
  }) => StoreResult;
  setTimerElapsed: (seconds: number) => StoreResult;
  setTimerStart: (date: string, clock: string) => StoreResult;
  pauseTimer: (effectiveAt?: number) => void;
  resumeTimer: () => StoreResult;
  stopTimer: () => StoreResult;
  addEntry: (entry: Omit<TimeEntry, "id">, options?: AddEntryOptions) => StoreResult;
  updateEntry: (id: string, patch: Partial<Omit<TimeEntry, "id">>) => StoreResult;
  deleteEntry: (id: string) => StoreResult;
  restoreEntry: (entry: TimeEntry) => StoreResult;
  addProject: (project: Omit<Project, "id">) => StoreResult;
  updateProject: (id: string, patch: Partial<Omit<Project, "id">>) => StoreResult;
  deleteProject: (id: string) => StoreResult;
  addClient: (client: Omit<Client, "id">) => StoreResult;
  updateClient: (id: string, patch: Partial<Client>) => StoreResult;
  deleteClient: (id: string) => StoreResult;
  inviteMember: (email: string, role: Exclude<Role, "Owner">) => Promise<StoreResult>;
  resendInvite: (memberId: string) => Promise<StoreResult>;
  cancelInvite: (memberId: string) => Promise<StoreResult>;
  deleteMember: (memberId: string) => Promise<StoreResult>;
  removeMember: (memberId: string) => StoreResult;
  restoreMember: (memberId: string) => StoreResult;
  updateMemberRole: (memberId: string, role: Exclude<Role, "Owner">) => StoreResult;
  setTrello: (patch: Partial<TrelloState>) => StoreResult;
  setWorkspaceSettings: (patch: Partial<WorkspaceSettings>, workspaceId?: string) => StoreResult;
  setUserPreferences: (patch: Partial<UserPreferences>) => StoreResult;
  saveUserPreferences: (patch: Partial<UserPreferences>) => Promise<StoreResult>;
  updateCurrentMemberName: (name: string) => StoreResult;
  updateCurrentMemberEmail: (email: string) => StoreResult;
  switchWorkspace: (workspaceId: string) => StoreResult;
  createWorkspace: (
    name: string,
    billing: BillingPreference,
    logoDataUrl?: string | null,
  ) => Promise<StoreResult>;
  setWorkspaceBilling: (workspaceId: string, billing: BillingPreference) => StoreResult;
  updateWorkspace: (
    workspaceId: string,
    patch: { name?: string; logoDataUrl?: string | null },
  ) => StoreResult;
  archiveWorkspace: (workspaceId: string) => StoreResult;
  restoreWorkspace: (workspaceId: string) => StoreResult;
  leaveWorkspace: (workspaceId: string) => StoreResult;
  signOut: () => StoreResult;
  resumeSession: (memberId: string) => StoreResult;
}
