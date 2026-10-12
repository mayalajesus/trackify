import type { Client, Member, Project, Role, TimeEntry, TrelloState } from "./domain";
import type { CurrencyCode } from "./billing";
import type { Locale } from "./i18n";
import type { StoredReportFilters } from "./report-filter-storage";

export type WorkspaceStatus = "active" | "archived";

export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  initials: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  logoDataUrl: string | null;
  status: WorkspaceStatus;
  createdAt: string;
  archivedAt?: string;
}

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: Role;
  status: Member["status"];
  hourlyRate: number;
  currency: CurrencyCode;
  invitedAt?: string;
  joinedAt?: string;
}

export interface WorkspaceSummary extends Workspace {
  weekStart: WorkspaceSettings["weekStart"];
  ownerName: string;
  role: Role;
  membershipStatus: Member["status"];
  isOwned: boolean;
  hourlyRate: number;
  currency: CurrencyCode;
}

export interface WorkspaceSettings {
  weekStart: "monday" | "sunday";
}

export type ThemeMode = "system" | "light" | "dark";
export type SessionStatus = "active" | "signed-out";

export interface UserPreferences {
  favoriteTasks?: Record<string, import("./favorite-tasks").FavoriteTask[]>;
  idleDetection: boolean;
  language: Locale;
  theme: ThemeMode;
  avatarUrl: string | null;
  timezone: string;
  activeWorkspaceId: string | null;
  reportFilters: Record<string, StoredReportFilters>;
}

export interface WorkspaceData {
  workspace: Workspace;
  memberships: WorkspaceMembership[];
  entries: TimeEntry[];
  projects: Project[];
  clients: Client[];
  settings: WorkspaceSettings;
  trello: TrelloState;
}

export type PersistedAccount = {
  version: 13;
  identities: UserIdentity[];
  workspaces: WorkspaceData[];
  preferencesByUserId: Record<string, UserPreferences>;
};
