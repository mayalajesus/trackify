import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isFavoriteTasks } from "./favorite-tasks";
import { useAuth } from "./auth-context";
import { createApiDataSource } from "./api-data-source";
import type {
  PersistedAccount,
  SessionStatus,
  ThemeMode,
  UserIdentity,
  UserPreferences,
  Workspace,
  WorkspaceData,
  WorkspaceMembership,
  WorkspaceSettings,
  WorkspaceSummary,
} from "./account-types";
import {
  clients as seedClients,
  members as seedMembers,
  projects as seedProjects,
  timeEntries as seedEntries,
} from "./mock-data";
import type { Client, Member, Project, Role, TimeEntry, TrelloState } from "./domain";
import {
  addSecondsToDateTime,
  dateTimeToTimestamp,
  getElapsedSeconds,
  getEndDateForEntry,
  getLocalToday,
  isValidDateOnly,
  nowTime,
} from "./format";
import { defaultLocale, isLocale } from "./i18n";
import {
  canTrackProject as canTrackProjectForRole,
  hasPermission,
  type Permission,
} from "./permissions";
import { isDefaultAvatarUrl, resetSessionDefaultAvatar } from "./default-avatar";
import {
  defaultCurrencyForLocale,
  clientCurrencyOptions,
  isCurrencyCode,
  type BillingPreference,
  type CurrencyCode,
} from "./billing";
import { findTimeEntryConflict, type ScopedTimeIntervalEntry } from "./time-entry-overlap";
import { entriesForReportWindow, reportEntriesQueryName } from "./report-query";
import { parseStoredReportFiltersValue, type StoredReportFilters } from "./report-filter-storage";
import {
  createRunningTimer,
  recentTimerTasksFromEntries,
  rememberRecentTimerTask,
  validateTimerTaskStart,
  validateTimerDetails,
  type TimerTaskPreset,
} from "./timer-start";

export { findTimeEntryConflict, timeEntriesOverlap } from "./time-entry-overlap";
export type {
  PersistedAccount,
  SessionStatus,
  ThemeMode,
  UserIdentity,
  UserPreferences,
  Workspace,
  WorkspaceData,
  WorkspaceMembership,
  WorkspaceSettings,
  WorkspaceStatus,
  WorkspaceSummary,
} from "./account-types";

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerState {
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

export type { Permission } from "./permissions";

export type StoreResult =
  | {
      success: true;
      id?: string;
      invitationUrl?: string;
      emailStatus?: import("./account-data-source").InvitationEmailStatus;
      warning?: string;
      conflict?: TimeEntry;
    }
  | { success: false; error: string };

type AddEntryOptions = {
  allowWhileTimerActive?: boolean;
  refreshBilling?: boolean;
};

const initialTimer: TimerState = {
  status: "idle",
  workspaceId: null,
  task: "",
  projectId: null,
  billable: false,
  startedAt: null,
  startedDate: null,
  accumulated: 0,
  startClock: "09:00",
};

const initialSettings: WorkspaceSettings = {
  weekStart: "monday",
};

const initialPreferences: UserPreferences = {
  idleDetection: true,
  language: defaultLocale,
  theme: "system",
  avatarUrl: null,
  timezone: getInitialTimeZone(),
  activeWorkspaceId: null,
  reportFilters: {},
};

const initialTrello: TrelloState = {
  status: "disconnected",
  workspace: null,
  board: null,
  lists: [],
  cards: [],
  rule: "lists",
  lastSync: null,
};

function isValidClock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function getInitialTimeZone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(timezone) ? timezone : "UTC";
  } catch {
    return "UTC";
  }
}

export function getDevicePreferences(
  storedPreferences: UserPreferences,
  deviceTimeZone = getInitialTimeZone(),
): UserPreferences {
  // The device clock is authoritative; API defaults or another device's saved zone
  // must not shift the local dates and clock values used for tracking time.
  return storedPreferences.timezone === deviceTimeZone
    ? storedPreferences
    : { ...storedPreferences, timezone: deviceTimeZone };
}

function isValidAvatarUrl(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      ((/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value) &&
        value.length <= 1_500_000) ||
        /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/sign\/avatars\//.test(value) ||
        /^https:\/\/(?:[^/.]+\.)*googleusercontent\.com\//.test(value) ||
        isDefaultAvatarUrl(value)))
  );
}

function isValidLogoUrl(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      ((/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value) &&
        value.length <= 900_000) ||
        /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/sign\/workspace-logos\//.test(value)))
  );
}

function isValidPreferences(value: unknown): value is UserPreferences {
  if (!value || typeof value !== "object") return false;
  const prefs = value as Partial<UserPreferences>;
  return (
    (prefs.favoriteTasks === undefined || isFavoriteTasks(prefs.favoriteTasks)) &&
    typeof prefs.idleDetection === "boolean" &&
    isLocale(prefs.language) &&
    isThemeMode(prefs.theme) &&
    isValidAvatarUrl(prefs.avatarUrl) &&
    isValidTimeZone(prefs.timezone) &&
    (prefs.activeWorkspaceId === null || typeof prefs.activeWorkspaceId === "string") &&
    isRecord(prefs.reportFilters) &&
    Object.values(prefs.reportFilters).every(
      (filters) => parseStoredReportFiltersValue(filters) !== null,
    )
  );
}

function isValidSettings(value: unknown): value is WorkspaceSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<WorkspaceSettings>;
  return settings.weekStart === "monday" || settings.weekStart === "sunday";
}

function isValidClient(value: unknown): value is Client {
  if (!value || typeof value !== "object") return false;
  const client = value as Partial<Client>;
  return (
    typeof client.id === "string" &&
    typeof client.name === "string" &&
    Boolean(client.name.trim()) &&
    typeof client.contact === "string" &&
    (client.billable === undefined || typeof client.billable === "boolean") &&
    (client.currency === undefined || clientCurrencyOptions.includes(client.currency))
  );
}

function isValidProject(value: unknown, clients: Client[]): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    Boolean(project.name.trim()) &&
    typeof project.clientId === "string" &&
    clients.some((client) => client.id === project.clientId) &&
    typeof project.billable === "boolean" &&
    (project.status === "active" ||
      project.status === "on-hold" ||
      project.status === "archived") &&
    typeof project.color === "string" &&
    typeof project.lastActivity === "string" &&
    Array.isArray(project.memberIds) &&
    project.memberIds.every((id) => typeof id === "string")
  );
}

function normalizedProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isValidEntry(value: unknown, projects: Project[]): value is TimeEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<TimeEntry>;
  if (
    typeof entry.id !== "string" ||
    !entry.id.trim() ||
    typeof entry.date !== "string" ||
    typeof entry.start !== "string" ||
    typeof entry.end !== "string" ||
    typeof entry.seconds !== "number" ||
    typeof entry.userId !== "string" ||
    typeof entry.task !== "string" ||
    typeof entry.billable !== "boolean"
  )
    return false;
  if (!isValidDateOnly(entry.date) || !isValidDateOnly(entry.endDate ?? entry.date)) return false;
  if (entry.endDate && entry.endDate < entry.date) return false;
  if (!isValidClock(entry.start) || !isValidClock(entry.end)) return false;
  if (entry.projectId !== null && typeof entry.projectId !== "string") return false;
  if (entry.projectId !== null && !projects.some((project) => project.id === entry.projectId))
    return false;
  if (!entry.task.trim() || !isFiniteNumber(entry.seconds) || entry.seconds <= 0) return false;
  if (entry.startTimestamp !== undefined && !isFiniteNumber(entry.startTimestamp)) return false;
  if (entry.endTimestamp !== undefined && !isFiniteNumber(entry.endTimestamp)) return false;
  if ((entry.startTimestamp === undefined) !== (entry.endTimestamp === undefined)) return false;
  if (entry.startTimestamp !== undefined && entry.endTimestamp! < entry.startTimestamp)
    return false;
  if (entry.hourlyRate !== undefined && (!isFiniteNumber(entry.hourlyRate) || entry.hourlyRate < 0))
    return false;
  if (entry.currency !== undefined && !isCurrencyCode(entry.currency)) return false;
  const calculated = getElapsedSeconds(entry as TimeEntry);
  return calculated > 0 && Math.abs(calculated - entry.seconds) <= 1;
}

function membershipToMember(
  membership: WorkspaceMembership,
  identities: UserIdentity[],
): Member | null {
  const identity = identities.find((candidate) => candidate.id === membership.userId);
  if (!identity) return null;
  return {
    ...identity,
    role: membership.role,
    status: membership.status,
    ...(membership.invitedAt ? { invitedAt: membership.invitedAt } : {}),
  };
}

function membersToMemberships(
  workspaceId: string,
  members: Member[],
  existingMemberships: WorkspaceMembership[] = [],
  billingByUserId: Record<string, BillingPreference> = {},
): WorkspaceMembership[] {
  const existingByUserId = new Map(
    existingMemberships.map((membership) => [membership.userId, membership]),
  );
  return members.map((member) => {
    const billing = billingByUserId[member.id] ?? existingByUserId.get(member.id);
    return {
      ...existingByUserId.get(member.id),
      workspaceId,
      userId: member.id,
      role: member.role,
      status: member.status,
      hourlyRate: billing?.hourlyRate ?? 0,
      currency: billing?.currency ?? defaultCurrencyForLocale(defaultLocale),
      ...(member.invitedAt ? { invitedAt: member.invitedAt } : {}),
    };
  });
}

function createIdentity(member: Member): UserIdentity {
  return { id: member.id, name: member.name, email: member.email, initials: member.initials };
}

export function migrateAccountSnapshot(value: unknown): PersistedAccount | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    version?: unknown;
    identities?: UserIdentity[];
    workspaces?: WorkspaceData[];
    preferencesByUserId?: Record<string, unknown>;
  };
  if (
    (raw.version !== 9 && raw.version !== 10 && raw.version !== 11 && raw.version !== 12) ||
    !Array.isArray(raw.identities) ||
    !Array.isArray(raw.workspaces) ||
    !raw.workspaces.every((workspace) => Array.isArray(workspace?.memberships)) ||
    !raw.preferencesByUserId ||
    typeof raw.preferencesByUserId !== "object"
  )
    return null;

  const preferencesByUserId: Record<string, UserPreferences> = {};
  const billingByUserId: Record<string, BillingPreference> = {};
  for (const identity of raw.identities) {
    if (!identity || typeof identity !== "object" || typeof identity.id !== "string") return null;
    const candidate = raw.preferencesByUserId[identity.id];
    if (!candidate || typeof candidate !== "object") return null;
    const preferences = candidate as Partial<UserPreferences> & Partial<BillingPreference>;
    if (
      typeof preferences.idleDetection !== "boolean" ||
      !isLocale(preferences.language) ||
      !isThemeMode(preferences.theme) ||
      !isValidAvatarUrl(preferences.avatarUrl)
    )
      return null;
    billingByUserId[identity.id] = {
      hourlyRate:
        isFiniteNumber(preferences.hourlyRate) && preferences.hourlyRate >= 0
          ? preferences.hourlyRate
          : 0,
      currency: isCurrencyCode(preferences.currency)
        ? preferences.currency
        : defaultCurrencyForLocale(preferences.language),
    };
    const reportFilters =
      isRecord(preferences.reportFilters) &&
      Object.values(preferences.reportFilters).every(
        (filters) => parseStoredReportFiltersValue(filters) !== null,
      )
        ? (preferences.reportFilters as Record<string, StoredReportFilters>)
        : {};
    preferencesByUserId[identity.id] = {
      idleDetection: preferences.idleDetection,
      language: preferences.language,
      theme: preferences.theme,
      avatarUrl: preferences.avatarUrl,
      timezone: isValidTimeZone(preferences.timezone) ? preferences.timezone : getInitialTimeZone(),
      activeWorkspaceId:
        preferences.activeWorkspaceId === null || typeof preferences.activeWorkspaceId === "string"
          ? preferences.activeWorkspaceId
          : null,
      reportFilters,
      favoriteTasks: isFavoriteTasks(preferences.favoriteTasks) ? preferences.favoriteTasks : {},
    };
  }

  const migrated: PersistedAccount = {
    version: 13,
    identities: raw.identities,
    workspaces: raw.workspaces.map((data) => ({
      ...data,
      settings: {
        weekStart: data.settings.weekStart === "sunday" ? "sunday" : "monday",
      },
      memberships: data.memberships.map((membership) => {
        const current = membership as Partial<WorkspaceMembership> &
          Pick<WorkspaceMembership, "userId">;
        const fallback = billingByUserId[current.userId] ?? {
          hourlyRate: 0,
          currency: "USD" as const,
        };
        return {
          ...membership,
          hourlyRate:
            isFiniteNumber(current.hourlyRate) && current.hourlyRate >= 0
              ? current.hourlyRate
              : fallback.hourlyRate,
          currency: isCurrencyCode(current.currency) ? current.currency : fallback.currency,
        };
      }),
    })),
    preferencesByUserId,
  };
  const repaired = repairDuplicateEntryIds(migrated);
  return isValidAccount(repaired) ? repaired : null;
}

/**
 * Older local snapshots could contain duplicate entry IDs because the in-memory
 * counter restarted after a full page reload. Repair only the later copies so
 * the first existing record keeps its original identity and history.
 */
export function repairDuplicateEntryIds(value: unknown): unknown {
  if (
    !isRecord(value) ||
    (value["version"] !== 10 &&
      value["version"] !== 11 &&
      value["version"] !== 12 &&
      value["version"] !== 13) ||
    !Array.isArray(value["workspaces"])
  ) {
    return value;
  }

  const workspaces = value["workspaces"];
  if (
    !workspaces.every((workspace) => isRecord(workspace) && Array.isArray(workspace["entries"]))
  ) {
    return value;
  }

  let replacementNumber = 0;
  let changed = false;
  const repairedWorkspaces = workspaces.map((workspace) => {
    const record = workspace as Record<string, unknown>;
    const entries = record["entries"] as unknown[];
    const originalIds = new Set<string>();
    const usedIds = new Set<string>();
    for (const entry of entries) {
      if (isRecord(entry) && typeof entry["id"] === "string" && entry["id"].trim()) {
        originalIds.add(entry["id"]);
      }
    }
    let workspaceChanged = false;
    const repairedEntries = entries.map((entry) => {
      if (!isRecord(entry) || typeof entry["id"] !== "string") return entry;

      const id = entry["id"];
      if (id.trim() && !usedIds.has(id)) {
        usedIds.add(id);
        return entry;
      }

      let replacementId = "";
      do {
        replacementId = `t-migrated-${++replacementNumber}`;
      } while (originalIds.has(replacementId) || usedIds.has(replacementId));

      usedIds.add(replacementId);
      changed = true;
      workspaceChanged = true;
      return { ...entry, id: replacementId };
    });

    return workspaceChanged ? { ...record, entries: repairedEntries } : workspace;
  });

  return changed ? { ...value, workspaces: repairedWorkspaces } : value;
}

export function makeSeedAccount(): PersistedAccount {
  const identities = seedMembers.map(createIdentity);
  const defaultWorkspaceId = "w1";
  const sharedWorkspaceId = "w2";
  const defaultWorkspace: WorkspaceData = {
    workspace: {
      id: defaultWorkspaceId,
      name: "Studio Co.",
      ownerId: "u1",
      logoDataUrl: null,
      status: "active",
      createdAt: "2026-08-01T09:00:00.000Z",
    },
    memberships: membersToMemberships(defaultWorkspaceId, seedMembers),
    entries: seedEntries,
    projects: seedProjects,
    clients: seedClients,
    settings: { ...initialSettings },
    trello: initialTrello,
  };
  const sharedMembers: Member[] = [
    { ...seedMembers[1]!, role: "Owner" },
    { ...seedMembers[0]!, role: "Member" },
    { ...seedMembers[2]!, role: "Member" },
  ];
  const sharedWorkspace: WorkspaceData = {
    workspace: {
      id: sharedWorkspaceId,
      name: "Product Lab",
      ownerId: "u2",
      logoDataUrl: null,
      status: "active",
      createdAt: "2026-08-05T09:00:00.000Z",
    },
    memberships: membersToMemberships(sharedWorkspaceId, sharedMembers),
    entries: seedEntries.filter((entry) => entry.projectId === "p1"),
    projects: seedProjects.filter((project) => project.id === "p1"),
    clients: seedClients.filter((client) => client.id === "c1"),
    settings: { ...initialSettings },
    trello: initialTrello,
  };
  return {
    version: 13,
    identities,
    workspaces: [defaultWorkspace, sharedWorkspace],
    preferencesByUserId: Object.fromEntries(
      identities.map((identity) => [identity.id, { ...initialPreferences }]),
    ),
  };
}

export function isValidAccount(value: unknown): value is PersistedAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<PersistedAccount>;
  if (
    account.version !== 13 ||
    !Array.isArray(account.identities) ||
    !Array.isArray(account.workspaces) ||
    !account.preferencesByUserId ||
    typeof account.preferencesByUserId !== "object"
  )
    return false;
  const identities = account.identities;
  const workspaces = account.workspaces;
  const preferencesByUserId = account.preferencesByUserId;
  const identityIds = new Set(identities.map((identity) => identity.id));
  const workspaceIds = new Set(workspaces.map((data) => data.workspace.id));
  if (
    identities.length === 0 ||
    identityIds.size !== identities.length ||
    !identities.every(
      (identity) =>
        identity &&
        typeof identity.id === "string" &&
        Boolean(identity.id.trim()) &&
        typeof identity.name === "string" &&
        Boolean(identity.name.trim()) &&
        typeof identity.email === "string" &&
        Boolean(identity.email.trim()) &&
        typeof identity.initials === "string" &&
        Boolean(identity.initials.trim()),
    ) ||
    !Object.values(preferencesByUserId).every(isValidPreferences)
  )
    return false;
  if (workspaceIds.size !== workspaces.length) return false;
  return workspaces.every((data) => {
    const entryIds = new Set<string>();
    if (!data || typeof data !== "object") return false;
    const workspace = data.workspace;
    if (
      !workspace ||
      typeof workspace.id !== "string" ||
      typeof workspace.name !== "string" ||
      !workspace.name.trim() ||
      typeof workspace.ownerId !== "string" ||
      !isValidLogoUrl(workspace.logoDataUrl) ||
      (workspace.status !== "active" && workspace.status !== "archived") ||
      typeof workspace.createdAt !== "string" ||
      Number.isNaN(Date.parse(workspace.createdAt)) ||
      (workspace.archivedAt !== undefined &&
        (typeof workspace.archivedAt !== "string" ||
          Number.isNaN(Date.parse(workspace.archivedAt)))) ||
      !identityIds.has(workspace.ownerId) ||
      !Array.isArray(data.memberships) ||
      !Array.isArray(data.clients) ||
      !Array.isArray(data.projects) ||
      !Array.isArray(data.entries) ||
      !isValidSettings(data.settings)
    )
      return false;
    if (!data.clients.every(isValidClient)) return false;
    const membershipIds = new Set(data.memberships.map((membership) => membership.userId));
    if (membershipIds.size !== data.memberships.length) return false;
    if (
      !data.memberships.every(
        (membership) =>
          membership &&
          membership.workspaceId === workspace.id &&
          typeof membership.userId === "string" &&
          identityIds.has(membership.userId) &&
          (membership.role === "Owner" ||
            membership.role === "Admin" ||
            membership.role === "Member") &&
          (membership.status === "active" ||
            membership.status === "invited" ||
            membership.status === "removed") &&
          isFiniteNumber(membership.hourlyRate) &&
          membership.hourlyRate >= 0 &&
          isCurrencyCode(membership.currency) &&
          (membership.invitedAt === undefined ||
            (typeof membership.invitedAt === "string" &&
              !Number.isNaN(Date.parse(membership.invitedAt)))) &&
          (membership.joinedAt === undefined ||
            (typeof membership.joinedAt === "string" &&
              !Number.isNaN(Date.parse(membership.joinedAt)))),
      )
    )
      return false;
    const ownerMemberships = data.memberships.filter(
      (membership) => membership.role === "Owner" && membership.userId === workspace.ownerId,
    );
    if (ownerMemberships.length !== 1) return false;
    if (
      data.memberships.some(
        (membership) => membership.role === "Owner" && membership.userId !== workspace.ownerId,
      )
    )
      return false;
    if (!data.projects.every((project) => isValidProject(project, data.clients))) return false;
    if (
      data.projects.some((project) =>
        project.memberIds.some((memberId) => !membershipIds.has(memberId)),
      )
    )
      return false;
    if (
      !data.entries.every(
        (entry) =>
          identityIds.has(entry.userId) &&
          membershipIds.has(entry.userId) &&
          isValidEntry(entry, data.projects),
      )
    )
      return false;
    for (const entry of data.entries) {
      if (entryIds.has(entry.id)) return false;
      entryIds.add(entry.id);
    }
    return true;
  });
}

export function elapsedForTimer(timer: TimerState, now = Date.now()): number {
  if (timer.status !== "running" || timer.startedAt === null) return timer.accumulated;
  return Math.max(0, timer.accumulated + Math.floor((now - timer.startedAt) / 1000));
}

export function pauseTimerAt(timer: TimerState, effectiveAt = Date.now()): TimerState {
  if (timer.status !== "running") return timer;
  const now = Date.now();
  const requestedAt = Number.isFinite(effectiveAt) ? effectiveAt : now;
  const pauseAt = Math.max(timer.startedAt ?? requestedAt, Math.min(requestedAt, now));
  return {
    ...timer,
    status: "paused",
    accumulated: elapsedForTimer(timer, pauseAt),
    startedAt: null,
  };
}

function initialsFromName(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

let idCounter = 100;
const nextId = (_prefix: string, _existingIds: Iterable<string> = []) => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const suffix = (++idCounter).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
};
const inviteEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface StoreValue {
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
  startTimer: (task: string, projectId: string | null, billable?: boolean) => StoreResult;
  startTimerFromTask: (task: TimerTaskPreset) => StoreResult;
  updateTimer: (patch: {
    task?: string;
    projectId?: string | null;
    billable?: boolean;
  }) => StoreResult;
  setTimerElapsed: (seconds: number) => StoreResult;
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
  removeMember: (memberId: string) => StoreResult;
  restoreMember: (memberId: string) => StoreResult;
  updateMemberRole: (memberId: string, role: Exclude<Role, "Owner">) => StoreResult;
  setTrello: (patch: Partial<TrelloState>) => StoreResult;
  setWorkspaceSettings: (patch: Partial<WorkspaceSettings>) => StoreResult;
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

const StoreContext = createContext<StoreValue | null>(null);
const TimerTickerContext = createContext<{ elapsed: number } | null>(null);

function reuseIfEqual<T>(previous: T, next: T): T {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

function reuseWorkspaceLogoUrl(previous: string | null, next: string | null) {
  if (!previous || !next || previous === next) return next;
  try {
    const oldUrl = new URL(previous);
    const newUrl = new URL(next);
    if (
      oldUrl.protocol !== "https:" ||
      !oldUrl.hostname.endsWith(".supabase.co") ||
      !oldUrl.pathname.startsWith("/storage/v1/object/sign/workspace-logos/") ||
      oldUrl.origin !== newUrl.origin ||
      oldUrl.pathname !== newUrl.pathname
    )
      return next;
    const payload = oldUrl.searchParams.get("token")?.split(".")[1];
    if (!payload) return next;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    // This only reads cache expiry; Storage still verifies the signature.
    // Refresh before expiry, but don't change the image src on every poll.
    return typeof exp === "number" && exp * 1000 > Date.now() + 5 * 60_000 ? previous : next;
  } catch {
    return next;
  }
}

function shareAccountReferences(
  previous: PersistedAccount,
  next: PersistedAccount,
): PersistedAccount {
  const identities = reuseIfEqual(previous.identities, next.identities);
  const preferencesByUserId = reuseIfEqual(previous.preferencesByUserId, next.preferencesByUserId);
  const previousWorkspaces = new Map(
    previous.workspaces.map((workspace) => [workspace.workspace.id, workspace]),
  );
  const workspaces = next.workspaces.map((workspace) => {
    const previousWorkspace = previousWorkspaces.get(workspace.workspace.id);
    if (!previousWorkspace) return workspace;
    const shared = {
      ...workspace,
      workspace: reuseIfEqual(previousWorkspace.workspace, {
        ...workspace.workspace,
        logoDataUrl: reuseWorkspaceLogoUrl(
          previousWorkspace.workspace.logoDataUrl,
          workspace.workspace.logoDataUrl,
        ),
      }),
      memberships: reuseIfEqual(previousWorkspace.memberships, workspace.memberships),
      entries: reuseIfEqual(previousWorkspace.entries, workspace.entries),
      projects: reuseIfEqual(previousWorkspace.projects, workspace.projects),
      clients: reuseIfEqual(previousWorkspace.clients, workspace.clients),
      settings: reuseIfEqual(previousWorkspace.settings, workspace.settings),
      trello: reuseIfEqual(previousWorkspace.trello, workspace.trello),
    };
    const unchanged =
      shared.workspace === previousWorkspace.workspace &&
      shared.memberships === previousWorkspace.memberships &&
      shared.entries === previousWorkspace.entries &&
      shared.projects === previousWorkspace.projects &&
      shared.clients === previousWorkspace.clients &&
      shared.settings === previousWorkspace.settings &&
      shared.trello === previousWorkspace.trello;
    return unchanged ? previousWorkspace : shared;
  });
  const sharedWorkspaces =
    workspaces.length === previous.workspaces.length &&
    workspaces.every((workspace, index) => workspace === previous.workspaces[index])
      ? previous.workspaces
      : workspaces;
  if (
    identities === previous.identities &&
    preferencesByUserId === previous.preferencesByUserId &&
    sharedWorkspaces === previous.workspaces
  )
    return previous;
  return { ...next, identities, preferencesByUserId, workspaces: sharedWorkspaces };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useAuth();
  const authenticatedUserId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const dataSource = useMemo(() => createApiDataSource(), []);
  const [account, setAccount] = useState<PersistedAccount>({
    version: 13,
    identities: [],
    workspaces: [],
    preferencesByUserId: {},
  });
  const [activeMemberId, setActiveMemberId] = useState(() => authenticatedUserId);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("signed-out");
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [timerPersistenceError, setTimerPersistenceError] = useState<string | null>(null);
  const [accountReloadKey, setAccountReloadKey] = useState(0);
  const accountScope = useMemo(
    () => ({ userId: authenticatedUserId, reloadKey: accountReloadKey }),
    [authenticatedUserId, accountReloadKey],
  );
  const accountScopeRef = useRef(accountScope);
  accountScopeRef.current = accountScope;
  const [hydrated, setHydrated] = useState(false);
  const [timerHydrated, setTimerHydrated] = useState(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const syncedAccountRef = useRef<PersistedAccount | null>(null);
  const accountRefreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const accountSyncPromiseRef = useRef<Promise<void> | null>(null);
  const timerSyncPromiseRef = useRef<Promise<void> | null>(null);
  const persistedTimerRef = useRef<{
    scope: typeof accountScope;
    workspaceId: string;
    value: string;
  } | null>(null);
  const workspaceCreationRef = useRef<{
    scope: typeof accountScope;
    promise: Promise<StoreResult>;
  } | null>(null);
  const activeData =
    account.workspaces.find((data) => data.workspace.id === activeWorkspaceId) ??
    account.workspaces[0];
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const membersRef = useRef(members);
  membersRef.current = members;
  const [settings, setSettingsState] = useState<WorkspaceSettings>(initialSettings);
  const [trello, setTrelloState] = useState<TrelloState>(initialTrello);
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const accountForSync = useMemo(() => {
    const current = account.workspaces.find((data) => data.workspace.id === activeWorkspaceId);
    if (!current) return account;
    const next: WorkspaceData = {
      ...current,
      entries,
      projects,
      clients,
      memberships: membersToMemberships(activeWorkspaceId, members, current.memberships),
      settings,
      trello,
    };
    if (
      current.entries === entries &&
      current.projects === projects &&
      current.clients === clients &&
      current.settings === settings &&
      current.trello === trello &&
      JSON.stringify(current.memberships) === JSON.stringify(next.memberships)
    )
      return account;
    return {
      ...account,
      workspaces: account.workspaces.map((data) =>
        data.workspace.id === activeWorkspaceId ? next : data,
      ),
    };
  }, [account, activeWorkspaceId, clients, entries, members, projects, settings, trello]);
  const accountForSyncRef = useRef(accountForSync);
  accountForSyncRef.current = accountForSync;
  const [elapsed, setElapsed] = useState(() => elapsedForTimer(timer));
  const storedPreferences = account.preferencesByUserId[activeMemberId] ?? initialPreferences;
  const deviceTimeZone = getInitialTimeZone();
  const preferences = useMemo(
    () => getDevicePreferences(storedPreferences, deviceTimeZone),
    [deviceTimeZone, storedPreferences],
  );
  const currentWorkspace = activeData?.workspace ?? null;
  const currentWorkspaceMembership =
    activeData?.memberships.find((membership) => membership.userId === activeMemberId) ?? null;
  const workspaceBilling = useMemo<BillingPreference>(
    () =>
      currentWorkspaceMembership
        ? {
            hourlyRate: currentWorkspaceMembership.hourlyRate,
            currency: currentWorkspaceMembership.currency,
          }
        : { hourlyRate: 0, currency: defaultCurrencyForLocale(preferences.language) },
    [currentWorkspaceMembership, preferences.language],
  );
  const billingPreferencesByUserId = useMemo(
    () =>
      Object.fromEntries(
        (activeData?.memberships ?? []).map((membership) => [
          membership.userId,
          { hourlyRate: membership.hourlyRate, currency: membership.currency },
        ]),
      ),
    [activeData?.memberships],
  );
  const [today, setToday] = useState(() => getLocalToday(new Date(), preferences.timezone));
  const currentMember = members.find((member) => member.id === activeMemberId) ?? null;
  const timerRef = useRef(timer);
  const timerRevisionRef = useRef(0);
  timerRef.current = timer;
  const recentTasks = useMemo(() => {
    const entriesForMember = entries.filter((entry) => entry.userId === activeMemberId);
    const recent = recentTimerTasksFromEntries(entriesForMember);
    if (timer.status === "idle" || timer.workspaceId !== activeWorkspaceId) return recent;
    return rememberRecentTimerTask(recent, timer);
  }, [activeMemberId, activeWorkspaceId, entries, timer]);
  const retryAccountLoad = useCallback(() => setAccountReloadKey((value) => value + 1), []);

  const persistAccount = useCallback((): Promise<boolean> => {
    const previousSync = accountSyncPromiseRef.current ?? Promise.resolve();
    const request = previousSync
      .catch(() => undefined)
      .then(async () => {
        if (!authenticatedUserId || accountScopeRef.current !== accountScope) return false;
        const snapshot = accountForSyncRef.current;
        if (JSON.stringify(snapshot) === JSON.stringify(syncedAccountRef.current)) return true;
        const result = await dataSource.syncAccount(authenticatedUserId, snapshot);
        if (accountScopeRef.current !== accountScope) return false;
        if (!result.success) {
          setAccountError(result.error);
          return false;
        }
        syncedAccountRef.current = snapshot;
        setAccountError(null);
        return true;
      });
    const trackedSync: Promise<void> = request
      .then(() => undefined)
      .finally(() => {
        if (accountSyncPromiseRef.current === trackedSync) accountSyncPromiseRef.current = null;
      });
    accountSyncPromiseRef.current = trackedSync;
    return request;
  }, [accountScope, authenticatedUserId, dataSource]);

  const refreshAccount = useCallback(async (): Promise<boolean> => {
    if (authLoading || !authenticatedUserId || !hydrated) return false;
    const scope = accountScope;
    if (accountScopeRef.current !== scope) return false;
    // Polls must not replace edits waiting for the debounce or an active save.
    if (
      accountSyncPromiseRef.current ||
      JSON.stringify(accountForSyncRef.current) !== JSON.stringify(syncedAccountRef.current)
    )
      return false;
    if (accountRefreshPromiseRef.current) {
      const previousResult = await accountRefreshPromiseRef.current;
      if (accountScopeRef.current !== scope) return false;
      return previousResult;
    }
    const request = (async () => {
      if (accountScopeRef.current !== scope) return false;
      const snapshot = accountForSyncRef.current;
      const result = await dataSource.loadAccount(authenticatedUserId);
      if (accountScopeRef.current !== scope || accountForSyncRef.current !== snapshot) return false;
      if (!result.success) {
        setAccountError(result.error);
        return false;
      }

      const loadedAccount = shareAccountReferences(accountRef.current, result.data);
      const preferredWorkspaceId =
        loadedAccount.preferencesByUserId[authenticatedUserId]?.activeWorkspaceId;
      const currentWorkspace = loadedAccount.workspaces.find(
        (data) =>
          data.workspace.id === activeWorkspaceId &&
          data.workspace.status === "active" &&
          data.memberships.some(
            (membership) =>
              membership.userId === authenticatedUserId && membership.status === "active",
          ),
      );
      const nextWorkspace =
        currentWorkspace ??
        loadedAccount.workspaces.find(
          (data) =>
            data.workspace.id === preferredWorkspaceId &&
            data.workspace.status === "active" &&
            data.memberships.some(
              (membership) =>
                membership.userId === authenticatedUserId && membership.status === "active",
            ),
        ) ??
        loadedAccount.workspaces.find(
          (data) =>
            data.workspace.status === "active" &&
            data.memberships.some(
              (membership) =>
                membership.userId === authenticatedUserId && membership.status === "active",
            ),
        );
      if (!nextWorkspace) {
        syncedAccountRef.current = loadedAccount;
        setAccount(loadedAccount);
        setActiveWorkspaceId("");
        setEntries([]);
        setProjects([]);
        setClients([]);
        setMembers([]);
        setSettingsState(initialSettings);
        setTrelloState(initialTrello);
        setTimer(initialTimer);
        setTimerHydrated(false);
        setAccountError(null);
        return true;
      }

      const mappedMembers = nextWorkspace.memberships
        .map((membership) => membershipToMember(membership, loadedAccount.identities))
        .filter((member): member is Member => member !== null);
      const nextMembers = reuseIfEqual(membersRef.current, mappedMembers);
      const workspaceChanged = nextWorkspace.workspace.id !== activeWorkspaceId;
      syncedAccountRef.current = loadedAccount;
      setAccount(loadedAccount);
      setActiveWorkspaceId(nextWorkspace.workspace.id);
      setEntries(nextWorkspace.entries);
      setProjects(nextWorkspace.projects);
      setClients(nextWorkspace.clients);
      setMembers(nextMembers);
      setSettingsState(nextWorkspace.settings);
      setTrelloState(nextWorkspace.trello);
      if (workspaceChanged) {
        setTimer(initialTimer);
        setTimerHydrated(false);
      }
      setAccountError(null);
      return true;
    })();
    accountRefreshPromiseRef.current = request;
    try {
      return await request;
    } finally {
      if (accountRefreshPromiseRef.current === request) accountRefreshPromiseRef.current = null;
    }
  }, [accountScope, activeWorkspaceId, authLoading, dataSource, hydrated, authenticatedUserId]);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!authenticatedUserId) {
      syncedAccountRef.current = null;
      setTimerPersistenceError(null);
      setAccountLoading(false);
      setAccountError(null);
      setHydrated(false);
      setTimerHydrated(false);
      setSessionStatus("signed-out");
      setAccount({ version: 13, identities: [], workspaces: [], preferencesByUserId: {} });
      setActiveMemberId("");
      setActiveWorkspaceId("");
      setEntries([]);
      setProjects([]);
      setClients([]);
      setMembers([]);
      setTimer(initialTimer);
      return;
    }

    setSessionStatus("active");
    setAccountLoading(true);
    setAccountError(null);
    setHydrated(false);
    setTimerHydrated(false);
    setActiveMemberId(authenticatedUserId);
    void dataSource.loadAccount(authenticatedUserId).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setAccountLoading(false);
        setAccountError(result.error);
        return;
      }
      const loadedAccount = result.data;
      const preferredWorkspaceId =
        loadedAccount.preferencesByUserId[authenticatedUserId]?.activeWorkspaceId;
      const canUseWorkspace = (data: WorkspaceData) =>
        data.workspace.status === "active" &&
        data.memberships.some(
          (membership) =>
            membership.userId === authenticatedUserId && membership.status === "active",
        );
      const nextWorkspace =
        loadedAccount.workspaces.find(
          (data) => data.workspace.id === preferredWorkspaceId && canUseWorkspace(data),
        ) ?? loadedAccount.workspaces.find(canUseWorkspace);
      if (!nextWorkspace) {
        syncedAccountRef.current = loadedAccount;
        setAccount(loadedAccount);
        setActiveWorkspaceId("");
        setEntries([]);
        setProjects([]);
        setClients([]);
        setMembers([]);
        setSettingsState(initialSettings);
        setTrelloState(initialTrello);
        setTimer(initialTimer);
        setTimerHydrated(false);
        setHydrated(true);
        setAccountLoading(false);
        setAccountError(null);
        return;
      }
      const nextMembers =
        nextWorkspace?.memberships
          .map((membership) => membershipToMember(membership, loadedAccount.identities))
          .filter((member): member is Member => member !== null) ?? [];
      syncedAccountRef.current = loadedAccount;
      setAccount(loadedAccount);
      setActiveWorkspaceId(nextWorkspace?.workspace.id ?? "");
      setEntries(nextWorkspace?.entries ?? []);
      setProjects(nextWorkspace?.projects ?? []);
      setClients(nextWorkspace?.clients ?? []);
      setMembers(nextMembers);
      setSettingsState(nextWorkspace?.settings ?? initialSettings);
      setTrelloState(nextWorkspace?.trello ?? initialTrello);
      setTimer(initialTimer);
      setHydrated(true);
      setAccountLoading(false);
      setAccountError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [accountReloadKey, authLoading, dataSource, authenticatedUserId]);

  useEffect(() => {
    if (!hydrated || !authenticatedUserId) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAccount();
    };
    const id = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [hydrated, refreshAccount, authenticatedUserId]);

  useEffect(() => {
    if (!hydrated || !activeWorkspaceId) return;
    const reportQueries = queryClient.getQueryCache().findAll({
      predicate: (query) => {
        const [name, parameters] = query.queryKey as [
          unknown,
          { workspaceId?: string; startDate?: string; endDate?: string } | undefined,
        ];
        return (
          name === reportEntriesQueryName &&
          parameters?.workspaceId === activeWorkspaceId &&
          typeof parameters.startDate === "string" &&
          typeof parameters.endDate === "string"
        );
      },
    });
    for (const query of reportQueries) {
      if (query.state.dataUpdatedAt === 0) continue;
      const parameters = query.queryKey[1] as {
        startDate: string;
        endDate: string;
      };
      queryClient.setQueryData(
        query.queryKey,
        entriesForReportWindow(entries, parameters.startDate, parameters.endDate),
      );
    }
  }, [activeWorkspaceId, entries, hydrated, queryClient]);

  useEffect(() => {
    if (!hydrated || !authenticatedUserId || !activeWorkspaceId) return;
    let cancelled = false;
    setTimerHydrated(false);
    setTimerPersistenceError(null);
    const timerRevision = timerRevisionRef.current;
    void (async () => {
      // Finish earlier writes before reading the timer for this workspace.
      if (timerSyncPromiseRef.current) await timerSyncPromiseRef.current;
      if (cancelled || accountScopeRef.current !== accountScope) return;
      const result = await dataSource.getActiveTimer(authenticatedUserId, activeWorkspaceId);
      if (cancelled || accountScopeRef.current !== accountScope) return;
      if (!result.success) {
        setTimerPersistenceError(result.error);
        return;
      }
      const hydratedTimer = result.data ?? initialTimer;
      persistedTimerRef.current = {
        scope: accountScope,
        workspaceId: activeWorkspaceId,
        value: JSON.stringify(hydratedTimer),
      };
      // Do not let a slow hydration response overwrite a timer the user started
      // while the request was in flight. Once hydrated, the persistence effect
      // below saves that newer local timer normally.
      if (timerRevisionRef.current === timerRevision) {
        timerRef.current = hydratedTimer;
        setTimer(hydratedTimer);
      }
      setTimerHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountScope, activeMemberId, activeWorkspaceId, dataSource, hydrated, authenticatedUserId]);

  useEffect(() => {
    if (!hydrated || !timerHydrated || !authenticatedUserId || !activeWorkspaceId) return;
    // Let users complete older timers in the editor before persisting them.
    if (timer.status !== "idle" && !validateTimerDetails(timer.task, timer.projectId).success)
      return;
    let cancelled = false;
    const isCurrent = () => !cancelled && accountScopeRef.current === accountScope;
    const previous = timerSyncPromiseRef.current ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(async () => {
        if (!isCurrent()) return;
        const value = JSON.stringify(timer);
        if (
          persistedTimerRef.current?.scope === accountScope &&
          persistedTimerRef.current.workspaceId === activeWorkspaceId &&
          persistedTimerRef.current.value === value
        )
          return;
        // Save project/entry changes before the timer references them or is cleared.
        if (!(await persistAccount()) || !isCurrent()) return;
        const result =
          timer.status === "idle"
            ? await dataSource.clearActiveTimer(authenticatedUserId, activeWorkspaceId)
            : await dataSource.saveActiveTimer(authenticatedUserId, timer);
        if (accountScopeRef.current !== accountScope) return;
        if (!result.success) {
          persistedTimerRef.current = null;
          if (isCurrent()) setTimerPersistenceError(result.error);
          return;
        }
        // Even an obsolete in-flight save changed the server. The next queued
        // operation must see that result (especially a stop following a start).
        persistedTimerRef.current = { scope: accountScope, workspaceId: activeWorkspaceId, value };
        if (isCurrent()) setTimerPersistenceError(null);
      });
    const tracked = request.finally(() => {
      if (timerSyncPromiseRef.current === tracked) timerSyncPromiseRef.current = null;
    });
    timerSyncPromiseRef.current = tracked;
    return () => {
      cancelled = true;
    };
  }, [
    activeMemberId,
    activeWorkspaceId,
    dataSource,
    hydrated,
    authenticatedUserId,
    timer,
    timerHydrated,
    accountScope,
    persistAccount,
  ]);

  useEffect(() => {
    const current = account.workspaces.find((data) => data.workspace.id === activeWorkspaceId);
    if (!current) return;
    const next: WorkspaceData = {
      ...current,
      entries,
      projects,
      clients,
      memberships: membersToMemberships(activeWorkspaceId, members, current.memberships),
      settings,
      trello,
    };
    if (
      current.entries === entries &&
      current.projects === projects &&
      current.clients === clients &&
      current.settings === settings &&
      current.trello === trello &&
      JSON.stringify(current.memberships) === JSON.stringify(next.memberships)
    )
      return;
    setAccount((previous) => ({
      ...previous,
      workspaces: previous.workspaces.map((data) =>
        data.workspace.id === activeWorkspaceId ? next : data,
      ),
    }));
  }, [
    account.workspaces,
    activeWorkspaceId,
    clients,
    entries,
    members,
    projects,
    settings,
    trello,
  ]);

  useEffect(() => {
    if (!hydrated || !authenticatedUserId) return;
    // Hydration and refreshes are reads, not local edits. Compare against the
    // actual server snapshot instead of skipping the next arbitrary render.
    if (JSON.stringify(accountForSync) === JSON.stringify(syncedAccountRef.current)) return;
    const id = window.setTimeout(() => {
      void persistAccount();
    }, 200);
    return () => window.clearTimeout(id);
  }, [accountForSync, hydrated, authenticatedUserId, persistAccount]);

  useEffect(() => {
    const refreshToday = () => setToday(getLocalToday(new Date(), preferences.timezone));
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") refreshToday();
    };
    refreshToday();
    const id = window.setInterval(refreshToday, 60_000);
    window.addEventListener("focus", refreshToday);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshToday);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [preferences.timezone]);

  useEffect(() => {
    const refreshElapsed = () => setElapsed(elapsedForTimer(timerRef.current));
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") refreshElapsed();
    };
    refreshElapsed();
    window.addEventListener("focus", refreshElapsed);
    document.addEventListener("visibilitychange", refreshWhenActive);
    if (timer.status !== "running")
      return () => {
        window.removeEventListener("focus", refreshElapsed);
        document.removeEventListener("visibilitychange", refreshWhenActive);
      };
    const id = window.setInterval(refreshElapsed, 1000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshElapsed);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [timer.status, timer.startedAt, timer.accumulated]);

  const value = useMemo<StoreValue>(() => {
    const can = (permission: Permission): boolean =>
      hasPermission(currentMember?.role ?? null, permission, {
        sessionActive: sessionStatus === "active",
        memberActive: currentMember?.status === "active",
        workspaceStatus: currentWorkspace?.status ?? "archived",
      });

    const canTrackProject = (projectId: string): boolean => {
      const project = projects.find((candidate) => candidate.id === projectId);
      return canTrackProjectForRole(currentMember?.role ?? null, activeMemberId, project ?? null, {
        sessionActive: sessionStatus === "active",
        memberActive: currentMember?.status === "active",
      });
    };

    const validateProjectId = (projectId: string | null, allowUnassigned = false): StoreResult => {
      if (projectId === null) return { success: true };
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) return { success: false, error: "This project no longer exists." };
      if (allowUnassigned) return { success: true };
      if (project.status === "archived")
        return {
          success: false,
          error: "This project is archived and cannot be used to start a timer.",
        };
      if (project.status !== "active")
        return {
          success: false,
          error: "This project is inactive and cannot be used to start a timer.",
        };
      if (canTrackProject(projectId)) return { success: true };
      return { success: false, error: "This project is not assigned to your team member." };
    };

    const validateEntry = (
      entry: Omit<TimeEntry, "id">,
      allowExistingProjectId?: string | null,
    ): StoreResult => {
      const projectValidation = validateProjectId(
        entry.projectId,
        entry.projectId === allowExistingProjectId,
      );
      if (!projectValidation.success) return projectValidation;
      if (!entry.task.trim()) return { success: false, error: "A task is required." };
      if (!isValidDateOnly(entry.date)) return { success: false, error: "Choose a valid date." };
      if (entry.endDate && (!isValidDateOnly(entry.endDate) || entry.endDate < entry.date))
        return { success: false, error: "Choose a valid end date." };
      const endDate = getEndDateForEntry(entry);
      const calculated = getElapsedSeconds({ ...entry, endDate });
      if (calculated <= 0 || entry.seconds <= 0)
        return { success: false, error: "End time must be after start time." };
      if (Math.abs(calculated - entry.seconds) > 1)
        return { success: false, error: "Duration must match the selected time range." };
      return { success: true };
    };

    const findEntryConflict = (
      entry: Omit<TimeEntry, "id">,
      excludedEntryId?: string,
    ): TimeEntry | undefined =>
      findTimeEntryConflict(
        { ...entry, workspaceId: activeWorkspaceId },
        entries.map((existing): ScopedTimeIntervalEntry & TimeEntry => ({
          ...existing,
          workspaceId: activeWorkspaceId,
        })),
        {
          ...(excludedEntryId ? { excludeEntryId: excludedEntryId } : {}),
          timeZone: preferences.timezone,
        },
      );

    const currencyForProject = (projectId: string | null): CurrencyCode => {
      const project = projects.find((item) => item.id === projectId);
      return (
        clients.find((client) => client.id === project?.clientId)?.currency ??
        workspaceBilling.currency
      );
    };

    const startTimer = (
      task: string,
      projectId: string | null,
      billable?: boolean,
    ): StoreResult => {
      if (workspaceCreationRef.current?.scope === accountScope)
        return { success: false, error: "Wait for workspace creation to finish." };
      if (!can("track-own-time"))
        return { success: false, error: "Your account cannot track time." };
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before starting another one." };
      const details = validateTimerDetails(task, projectId);
      if (!details.success) return details;
      const projectValidation = validateProjectId(projectId);
      if (!projectValidation.success) return projectValidation;
      const projectDefault =
        projectId === null
          ? false
          : (projects.find((project) => project.id === projectId)?.billable ?? false);
      const now = Date.now();
      const next = createRunningTimer(
        { task, projectId, billable: billable ?? projectDefault },
        {
          workspaceId: activeWorkspaceId,
          now,
          startedDate: getLocalToday(new Date(now), preferences.timezone),
          startClock: nowTime(preferences.timezone, new Date(now)),
          hourlyRate: workspaceBilling.hourlyRate,
          currency: currencyForProject(projectId),
        },
      );
      timerRevisionRef.current += 1;

      timerRef.current = next;
      setElapsed(0);
      setTimer(next);
      return { success: true };
    };

    const startTimerFromTask = (task: TimerTaskPreset): StoreResult => {
      const validation = validateTimerTaskStart(task, {
        timerStatus: timerRef.current.status,
        projects,
        canUseProject: canTrackProject,
      });
      if (!validation.success) return validation;
      return startTimer(
        validation.preset.task,
        validation.preset.projectId,
        validation.preset.billable,
      );
    };

    const updateTimer = (patch: {
      task?: string;
      projectId?: string | null;
      billable?: boolean;
    }): StoreResult => {
      if (!can("track-own-time"))
        return { success: false, error: "Your account cannot update the active timer." };
      const current = timerRef.current;
      if (current.status === "idle")
        return { success: false, error: "There is no active timer to update." };
      if (patch.projectId === null)
        return { success: false, error: "Select a project before starting the timer." };
      if (patch.projectId !== undefined) {
        const projectValidation = validateProjectId(patch.projectId);
        if (!projectValidation.success) return projectValidation;
      }
      if (patch.task !== undefined && !patch.task.trim())
        return { success: false, error: "A task is required." };
      const next = {
        ...current,
        ...patch,
        ...(patch.task !== undefined ? { task: patch.task.trim() } : {}),
        ...(patch.projectId !== undefined && patch.projectId !== current.projectId
          ? { currency: currencyForProject(patch.projectId) }
          : {}),
      };
      if (
        next.task === current.task &&
        next.projectId === current.projectId &&
        next.billable === current.billable
      )
        return { success: true };
      timerRevisionRef.current += 1;

      timerRef.current = next;
      setTimer(next);
      return { success: true };
    };

    const setTimerElapsed = (seconds: number): StoreResult => {
      if (!can("track-own-time"))
        return { success: false, error: "Your account cannot update the active timer." };
      const current = timerRef.current;
      if (current.status === "idle")
        return { success: false, error: "There is no active timer to update." };
      if (!Number.isFinite(seconds) || seconds < 0)
        return { success: false, error: "Enter a valid timer duration." };

      const nextElapsed = Math.floor(seconds);
      const next = {
        ...current,
        accumulated: nextElapsed,
        startedAt: current.status === "running" ? Date.now() : null,
      };
      timerRevisionRef.current += 1;

      timerRef.current = next;
      setElapsed(nextElapsed);
      setTimer(next);
      return { success: true };
    };

    const pauseTimer = (effectiveAt?: number) => {
      const current = timerRef.current;
      if (current.status !== "running") return;
      const next = pauseTimerAt(current, effectiveAt);
      timerRevisionRef.current += 1;

      timerRef.current = next;
      setElapsed(next.accumulated);
      setTimer(next);
    };

    const resumeTimer = (): StoreResult => {
      const current = timerRef.current;
      if (current.status !== "paused" || current.workspaceId !== activeWorkspaceId)
        return { success: false, error: "There is no paused timer to resume." };
      const details = validateTimerDetails(current.task, current.projectId);
      if (!details.success) return details;
      const projectValidation = validateProjectId(current.projectId);
      if (!projectValidation.success) return projectValidation;
      const next = { ...current, status: "running" as const, startedAt: Date.now() };
      timerRevisionRef.current += 1;

      timerRef.current = next;
      setTimer(next);
      return { success: true };
    };

    const stopTimer = (): StoreResult => {
      const current = timerRef.current;
      if (current.status === "idle" || current.workspaceId !== activeWorkspaceId)
        return { success: false, error: "There is no active timer to stop." };
      const details = validateTimerDetails(current.task, current.projectId);
      if (!details.success) return details;
      const total = elapsedForTimer(current);
      const startedDate = current.startedDate ?? getLocalToday(new Date(), preferences.timezone);
      const finish = addSecondsToDateTime(startedDate, current.startClock, total);
      let warning: string | undefined;
      let conflict: TimeEntry | undefined;
      if (total > 0) {
        const startTimestamp = dateTimeToTimestamp(
          startedDate,
          current.startClock,
          0,
          preferences.timezone,
        );
        const endTimestamp = startTimestamp === null ? null : startTimestamp + total * 1000;
        const stoppedEntry: Omit<TimeEntry, "id"> = {
          date: startedDate,
          start: current.startClock,
          end: finish.end,
          ...(finish.endDate !== startedDate ? { endDate: finish.endDate } : {}),
          ...(startTimestamp !== null ? { startTimestamp } : {}),
          ...(endTimestamp !== null ? { endTimestamp } : {}),
          seconds: total,
          userId: activeMemberId,
          projectId: current.projectId,
          task: current.task,
          billable: current.billable,
          hourlyRate: current.hourlyRate ?? workspaceBilling.hourlyRate,
          currency: current.currency ?? workspaceBilling.currency,
        };
        conflict = findEntryConflict(stoppedEntry);
        warning = conflict ? "This time overlaps another entry. It was saved anyway." : undefined;
        setEntries((list) => [
          {
            ...stoppedEntry,
            id: nextId(
              "t",
              list.map((entry) => entry.id),
            ),
          },
          ...list,
        ]);
      }
      timerRevisionRef.current += 1;

      timerRef.current = initialTimer;
      setTimer(initialTimer);
      setElapsed(0);
      return {
        success: true,
        ...(warning && conflict ? { warning, conflict } : {}),
      };
    };

    const addEntry = (entry: Omit<TimeEntry, "id">, options: AddEntryOptions = {}): StoreResult => {
      if (!can("manage-own-entries") || entry.userId !== activeMemberId)
        return { success: false, error: "You can only create your own time entries." };
      if (!options.allowWhileTimerActive && timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before adding time manually." };
      const billedEntry = {
        ...entry,
        hourlyRate:
          options.refreshBilling || entry.hourlyRate === undefined
            ? workspaceBilling.hourlyRate
            : entry.hourlyRate,
        currency:
          options.refreshBilling || entry.currency === undefined
            ? currencyForProject(entry.projectId)
            : entry.currency,
      } satisfies Omit<TimeEntry, "id">;
      const validation = validateEntry(billedEntry);
      if (!validation.success) return validation;
      const conflict = findEntryConflict(billedEntry);
      const warning = conflict
        ? "This time overlaps another entry. It was saved anyway."
        : undefined;
      setEntries((list) => [
        {
          ...billedEntry,
          id: nextId(
            "t",
            list.map((current) => current.id),
          ),
        },
        ...list,
      ]);
      return {
        success: true,
        ...(warning && conflict ? { warning, conflict } : {}),
      };
    };

    const updateEntry = (id: string, patch: Partial<Omit<TimeEntry, "id">>): StoreResult => {
      const current = entries.find((entry) => entry.id === id);
      if (!current) return { success: false, error: "This time entry no longer exists." };
      if (!can("manage-own-entries") || current.userId !== activeMemberId)
        return { success: false, error: "You can only edit your own time entries." };
      if (patch.userId !== undefined && patch.userId !== current.userId)
        return { success: false, error: "A time entry owner cannot be changed." };
      const next = {
        ...current,
        ...patch,
        ...(patch.projectId !== undefined && patch.projectId !== current.projectId
          ? { currency: currencyForProject(patch.projectId) }
          : {}),
      };
      const timeChanged = ["date", "start", "end", "endDate", "seconds"].some(
        (field) => field in patch,
      );
      if (timeChanged && !("startTimestamp" in patch) && !("endTimestamp" in patch)) {
        const onlyDateChanged =
          "date" in patch &&
          !["start", "end", "endDate", "seconds"].some((field) => field in patch);
        const startTimestamp =
          onlyDateChanged && typeof current.startTimestamp === "number"
            ? dateTimeToTimestamp(next.date, next.start, 0, preferences.timezone)
            : null;
        if (startTimestamp !== null) {
          next.startTimestamp = startTimestamp;
          next.endTimestamp = startTimestamp + next.seconds * 1000;
        } else {
          delete next.startTimestamp;
          delete next.endTimestamp;
        }
      }
      const validation = validateEntry(next, current.projectId);
      if (!validation.success) return validation;
      const conflict = timeChanged ? findEntryConflict(next, id) : undefined;
      const warning = conflict
        ? "This time overlaps another entry. It was saved anyway."
        : undefined;
      setEntries((list) => list.map((entry) => (entry.id === id ? next : entry)));
      return {
        success: true,
        ...(warning && conflict ? { warning, conflict } : {}),
      };
    };

    const deleteEntry = (id: string): StoreResult => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) return { success: false, error: "This time entry no longer exists." };
      if (!can("manage-own-entries") || entry.userId !== activeMemberId)
        return { success: false, error: "You can only delete your own time entries." };
      setEntries((list) => list.filter((candidate) => candidate.id !== id));
      return { success: true };
    };

    const restoreEntry = (entry: TimeEntry): StoreResult => {
      if (!can("manage-own-entries") || entry.userId !== activeMemberId)
        return { success: false, error: "You can only restore your own time entries." };
      if (entries.some((candidate) => candidate.id === entry.id))
        return { success: false, error: "This time entry already exists." };
      const validation = validateEntry(entry);
      if (!validation.success) return validation;
      const conflict = findEntryConflict(entry);
      const warning = conflict
        ? "This time overlaps another entry. It was saved anyway."
        : undefined;
      setEntries((list) => [entry, ...list]);
      return {
        success: true,
        ...(warning && conflict ? { warning, conflict } : {}),
      };
    };

    const addProject = (project: Omit<Project, "id">): StoreResult => {
      if (!can("manage-projects"))
        return { success: false, error: "Only Admins and the Owner can manage projects." };
      const projectName = project.name.trim().replace(/\s+/g, " ");
      if (!projectName) return { success: false, error: "A project name is required." };
      if (!clients.some((client) => client.id === project.clientId))
        return { success: false, error: "Choose an existing client for this project." };
      if (
        projects.some(
          (current) =>
            current.clientId === project.clientId &&
            normalizedProjectName(current.name) === normalizedProjectName(projectName),
        )
      )
        return {
          success: false,
          error: "A project with this name already exists for this client.",
        };
      if (typeof project.billable !== "boolean")
        return { success: false, error: "Choose whether this project is billable." };
      if (!can("manage-project-members"))
        return { success: false, error: "You cannot assign members to projects." };
      if (
        project.memberIds.some(
          (memberId) =>
            !members.some((member) => member.id === memberId && member.status === "active"),
        )
      )
        return { success: false, error: "Only active members can be assigned to a project." };
      const createdProject: Project = {
        ...project,
        name: projectName,
        memberIds: [...new Set([...project.memberIds, activeMemberId])],
        id: nextId(
          "p",
          projects.map((current) => current.id),
        ),
      };
      setProjects((list) => [createdProject, ...list]);
      setAccount((current) => ({
        ...current,
        workspaces: current.workspaces.map((data) =>
          data.workspace.id === activeWorkspaceId
            ? { ...data, projects: [createdProject, ...data.projects] }
            : data,
        ),
      }));
      return { success: true, id: createdProject.id };
    };

    const updateProject = (id: string, patch: Partial<Omit<Project, "id">>): StoreResult => {
      if (!can("manage-projects"))
        return { success: false, error: "Only Admins and the Owner can manage projects." };
      const current = projects.find((project) => project.id === id);
      if (!current) return { success: false, error: "This project no longer exists." };
      const next = {
        ...current,
        ...patch,
        name: (patch.name ?? current.name).trim().replace(/\s+/g, " "),
      };
      if (!next.name) return { success: false, error: "A project name is required." };
      if (!clients.some((client) => client.id === next.clientId))
        return { success: false, error: "A project must keep a valid client." };
      if (
        projects.some(
          (candidate) =>
            candidate.id !== id &&
            candidate.clientId === next.clientId &&
            normalizedProjectName(candidate.name) === normalizedProjectName(next.name),
        )
      )
        return {
          success: false,
          error: "A project with this name already exists for this client.",
        };
      if (typeof next.billable !== "boolean")
        return { success: false, error: "Choose whether this project is billable." };
      if ("memberIds" in patch && !can("manage-project-members"))
        return { success: false, error: "You cannot assign members to projects." };
      if (
        next.memberIds.some(
          (memberId) =>
            !members.some((member) => member.id === memberId && member.status === "active"),
        )
      )
        return { success: false, error: "Only active members can be assigned to a project." };
      setProjects((list) => list.map((project) => (project.id === id ? next : project)));
      return { success: true };
    };

    const deleteProject = (id: string): StoreResult => {
      if (!can("manage-projects"))
        return { success: false, error: "Only Admins and the Owner can manage projects." };
      const current = projects.find((project) => project.id === id);
      if (!current) return { success: false, error: "This project no longer exists." };
      if (current.status !== "archived")
        return { success: false, error: "Archive the project before deleting it." };
      if (entries.some((entry) => entry.projectId === id))
        return {
          success: false,
          error: "This project has tracked time. Keep it archived to preserve reports and history.",
        };
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before deleting a project." };
      setProjects((list) => list.filter((project) => project.id !== id));
      return { success: true };
    };

    const addClient = (client: Omit<Client, "id">): StoreResult => {
      if (!can("manage-clients"))
        return { success: false, error: "Only Admins and the Owner can manage clients." };
      if (!client.name.trim()) return { success: false, error: "A client name is required." };
      if (client.currency !== undefined && !clientCurrencyOptions.includes(client.currency))
        return { success: false, error: "Choose a valid currency." };
      setClients((list) => [
        {
          id: nextId(
            "c",
            list.map((current) => current.id),
          ),
          name: client.name.trim(),
          contact: client.contact.trim(),
          billable: client.billable ?? false,
          currency:
            client.currency ??
            (clientCurrencyOptions.includes(workspaceBilling.currency)
              ? workspaceBilling.currency
              : defaultCurrencyForLocale(preferences.language)),
        },
        ...list,
      ]);
      return { success: true };
    };

    const updateClient = (id: string, patch: Partial<Client>): StoreResult => {
      if (!can("manage-clients"))
        return { success: false, error: "Only Admins and the Owner can manage clients." };
      if (patch.currency !== undefined && !clientCurrencyOptions.includes(patch.currency))
        return { success: false, error: "Choose a valid currency." };
      const current = clients.find((client) => client.id === id);
      if (!current) return { success: false, error: "This client no longer exists." };
      const next = {
        ...current,
        ...patch,
        name: (patch.name ?? current.name).trim(),
        contact: (patch.contact ?? current.contact).trim(),
      };
      if (!next.name) return { success: false, error: "A client name is required." };
      setClients((list) => list.map((client) => (client.id === id ? next : client)));
      return { success: true };
    };

    const deleteClient = (id: string): StoreResult => {
      if (!can("manage-clients"))
        return { success: false, error: "Only Admins and the Owner can manage clients." };
      const current = clients.find((client) => client.id === id);
      if (!current) return { success: false, error: "This client no longer exists." };
      const linkedProjects = projects.filter((project) => project.clientId === id);
      if (linkedProjects.length > 0)
        return {
          success: false,
          error: `This client is used by ${linkedProjects.length} project${linkedProjects.length === 1 ? "" : "s"}. Remove or reassign those projects first.`,
        };
      setClients((list) => list.filter((client) => client.id !== id));
      return { success: true };
    };

    const inviteMember = async (
      email: string,
      role: Exclude<Role, "Owner">,
    ): Promise<StoreResult> => {
      if (!can("manage-members"))
        return { success: false, error: "Only Admins and the Owner can invite members." };
      const normalizedEmail = email.trim().toLowerCase();
      if (!inviteEmailPattern.test(normalizedEmail))
        return { success: false, error: "Enter a valid email address." };
      if (role !== "Admin" && role !== "Member")
        return { success: false, error: "Choose a valid role for this invitation." };
      if (role === "Admin" && !can("manage-admins"))
        return { success: false, error: "Only the Owner can invite Admins." };
      if (members.filter((member) => member.status !== "removed").length >= 50)
        return {
          success: false,
          error: "This workspace has reached its limit of 50 members and invitations.",
        };
      if (members.some((member) => member.email.toLowerCase() === normalizedEmail))
        return {
          success: false,
          error: "This email is already part of the team or has a pending invitation.",
        };
      const response = await dataSource.inviteMember(activeWorkspaceId, normalizedEmail, role);
      if (!response.success) return response;
      const { member: invitation, invitationUrl } = response.data;
      setMembers((list) => [invitation, ...list]);
      setAccount((current) => ({
        ...current,
        identities: current.identities.some((identity) => identity.id === invitation.id)
          ? current.identities
          : [...current.identities, createIdentity(invitation)],
      }));
      return {
        success: true,
        id: invitation.id,
        invitationUrl,
        emailStatus: response.data.emailStatus,
      };
    };

    const resendInvite = async (memberId: string): Promise<StoreResult> => {
      if (!can("manage-members"))
        return { success: false, error: "Only Admins and the Owner can manage invitations." };
      const member = members.find((candidate) => candidate.id === memberId);
      if (!member || member.status !== "invited")
        return { success: false, error: "Only pending invitations can be resent." };
      if (member.role === "Admin" && !can("manage-admins"))
        return { success: false, error: "Only the Owner can manage Admin invitations." };
      const response = await dataSource.resendInvitation(activeWorkspaceId, memberId);
      if (!response.success) return response;
      setMembers((list) =>
        list.map((candidate) => (candidate.id === memberId ? response.data.member : candidate)),
      );
      return {
        success: true,
        invitationUrl: response.data.invitationUrl,
        emailStatus: response.data.emailStatus,
      };
    };

    const cancelInvite = async (memberId: string): Promise<StoreResult> => {
      if (!can("manage-members"))
        return { success: false, error: "Only Admins and the Owner can manage invitations." };
      const member = members.find((candidate) => candidate.id === memberId);
      if (!member || member.status !== "invited")
        return { success: false, error: "Only pending invitations can be canceled." };
      if (member.role === "Admin" && !can("manage-admins"))
        return { success: false, error: "Only the Owner can manage Admin invitations." };
      const response = await dataSource.cancelInvitation(activeWorkspaceId, memberId);
      if (!response.success) return response;
      setMembers((list) => list.filter((candidate) => candidate.id !== memberId));
      setAccount((current) => ({
        ...current,
        identities: current.identities.filter((identity) => identity.id !== memberId),
      }));
      return { success: true };
    };

    const removeMember = (memberId: string): StoreResult => {
      if (!can("manage-members"))
        return { success: false, error: "Only Admins and the Owner can remove members." };
      const member = members.find((candidate) => candidate.id === memberId);
      if (!member) return { success: false, error: "This team member no longer exists." };
      if (memberId === activeMemberId && currentMember?.role === "Owner")
        return { success: false, error: "The Owner cannot remove their own account." };
      if (member.status !== "active")
        return { success: false, error: "Only active members can be removed." };
      if (member.role === "Owner")
        return { success: false, error: "The workspace owner cannot be removed." };
      if (member.role === "Admin" && !can("manage-admins"))
        return { success: false, error: "Only the Owner can remove Admins." };
      const activeAdmins = members.filter(
        (candidate) => candidate.status === "active" && candidate.role === "Admin",
      );
      if (member.role === "Admin" && activeAdmins.length <= 1)
        return { success: false, error: "The last admin cannot be removed." };
      setMembers((list) =>
        list.map((candidate) =>
          candidate.id === memberId ? { ...candidate, status: "removed" } : candidate,
        ),
      );
      setProjects((list) =>
        list.map((project) => ({
          ...project,
          memberIds: project.memberIds.filter((id) => id !== memberId),
        })),
      );
      return { success: true };
    };

    const restoreMember = (memberId: string): StoreResult => {
      if (!can("manage-members"))
        return { success: false, error: "Only Admins and the Owner can restore members." };
      const member = members.find((candidate) => candidate.id === memberId);
      if (!member || member.status !== "removed")
        return { success: false, error: "Only removed members can be restored." };
      if (member.role === "Admin" && !can("manage-admins"))
        return { success: false, error: "Only the Owner can restore Admins." };
      setMembers((list) =>
        list.map((candidate) =>
          candidate.id === memberId ? { ...candidate, status: "active" } : candidate,
        ),
      );
      return { success: true };
    };

    const updateMemberRole = (memberId: string, role: Exclude<Role, "Owner">): StoreResult => {
      const member = members.find((candidate) => candidate.id === memberId);
      if (!member) return { success: false, error: "This team member no longer exists." };
      if (memberId === activeMemberId && currentMember?.role === "Owner")
        return { success: false, error: "The Owner cannot change their own role." };
      if (member.role === "Owner")
        return { success: false, error: "The workspace owner role cannot be changed." };
      if (role !== "Admin" && role !== "Member")
        return { success: false, error: "Choose a valid team role." };
      if (currentMember?.role === "Admin" && member.role !== "Member")
        return { success: false, error: "Admins can only manage Members." };
      if (!can("manage-members"))
        return { success: false, error: "Only Admins and the Owner can change roles." };
      if (member.role === "Admin" && role === "Member") {
        if (!can("manage-admins"))
          return { success: false, error: "Only the Owner can reassign Admin roles." };
      }
      setMembers((list) =>
        list.map((candidate) => (candidate.id === memberId ? { ...candidate, role } : candidate)),
      );
      return { success: true };
    };

    const setTrello = (patch: Partial<TrelloState>): StoreResult => {
      if (!can("manage-integrations"))
        return { success: false, error: "Only Admins and the Owner can manage integrations." };
      setTrelloState((current) => ({ ...current, ...patch }));
      return { success: true };
    };

    const setWorkspaceSettings = (patch: Partial<WorkspaceSettings>): StoreResult => {
      if (!can("manage-workspace-settings"))
        return {
          success: false,
          error: "Only Admins and the Owner can change workspace settings.",
        };
      const next = { ...settings, ...patch };
      if (next.weekStart !== "monday" && next.weekStart !== "sunday")
        return { success: false, error: "Choose a valid week start." };
      setSettingsState(next);
      return { success: true };
    };

    const setUserPreferences = (patch: Partial<UserPreferences>): StoreResult => {
      if (sessionStatus !== "active" || !currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const next = { ...preferences, ...patch };
      if (!isValidPreferences(next))
        return { success: false, error: "Choose valid personal preferences." };
      setAccount((current) => ({
        ...current,
        preferencesByUserId: {
          ...current.preferencesByUserId,
          [activeMemberId]: {
            ...(current.preferencesByUserId[activeMemberId] ?? initialPreferences),
            ...patch,
          },
        },
      }));
      return { success: true };
    };

    const saveUserPreferences = async (patch: Partial<UserPreferences>): Promise<StoreResult> => {
      if (sessionStatus !== "active" || !currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const next = { ...preferences, ...patch };
      if (!isValidPreferences(next))
        return { success: false, error: "Choose valid personal preferences." };
      const remote = await dataSource.updatePreferences(activeMemberId, patch);
      if (!remote.success) return remote;
      setAccount((current) => ({
        ...current,
        preferencesByUserId: { ...current.preferencesByUserId, [activeMemberId]: next },
      }));
      return { success: true };
    };

    const updateCurrentMemberEmail = (email: string): StoreResult => {
      if (!currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const normalizedEmail = email.trim().toLowerCase();
      if (!inviteEmailPattern.test(normalizedEmail))
        return { success: false, error: "Enter a valid email address." };
      if (
        members.some(
          (member) =>
            member.id !== activeMemberId && member.email.toLowerCase() === normalizedEmail,
        )
      )
        return { success: false, error: "This email is already part of the team." };
      setAccount((current) => ({
        ...current,
        identities: current.identities.map((identity) =>
          identity.id === activeMemberId ? { ...identity, email: normalizedEmail } : identity,
        ),
      }));
      setMembers((list) =>
        list.map((member) =>
          member.id === activeMemberId ? { ...member, email: normalizedEmail } : member,
        ),
      );
      return { success: true };
    };

    const updateCurrentMemberName = (name: string): StoreResult => {
      if (!currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const normalizedName = name.trim().replace(/\s+/g, " ");
      if (!normalizedName) return { success: false, error: "A name is required." };
      if (normalizedName.split(" ").length < 2)
        return { success: false, error: "Enter your first and last name." };
      if (normalizedName.length > 120)
        return { success: false, error: "Name must be 120 characters or fewer." };
      const initials = initialsFromName(normalizedName);
      setAccount((current) => ({
        ...current,
        identities: current.identities.map((identity) =>
          identity.id === activeMemberId
            ? { ...identity, name: normalizedName, initials }
            : identity,
        ),
      }));
      setMembers((list) =>
        list.map((member) =>
          member.id === activeMemberId ? { ...member, name: normalizedName, initials } : member,
        ),
      );
      return { success: true };
    };

    const switchWorkspace = (workspaceId: string): StoreResult => {
      if (workspaceCreationRef.current?.scope === accountScope)
        return { success: false, error: "Wait for workspace creation to finish." };
      if (workspaceId === activeWorkspaceId) return { success: true };
      const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
      if (!target) return { success: false, error: "This workspace could not be found." };
      if (target.workspace.status === "archived")
        return { success: false, error: "Archived workspaces are read-only. Restore it first." };
      const membership = target.memberships.find(
        (candidate) => candidate.userId === activeMemberId,
      );
      if (!membership || membership.status !== "active")
        return { success: false, error: "You do not have access to this workspace." };
      if (timerRef.current.status === "running")
        return { success: false, error: "Pause the active timer before switching workspaces." };
      const current = account.workspaces.find((data) => data.workspace.id === activeWorkspaceId);
      if (current) {
        const currentSnapshot: WorkspaceData = {
          ...current,
          entries,
          projects,
          clients,
          memberships: membersToMemberships(activeWorkspaceId, members, current.memberships),
          settings,
          trello,
        };
        setAccount((previous) => ({
          ...previous,
          workspaces: previous.workspaces.map((data) =>
            data.workspace.id === activeWorkspaceId ? currentSnapshot : data,
          ),
        }));
      }
      setActiveWorkspaceId(workspaceId);
      setAccount((currentAccount) => ({
        ...currentAccount,
        preferencesByUserId: {
          ...currentAccount.preferencesByUserId,
          [activeMemberId]: {
            ...(currentAccount.preferencesByUserId[activeMemberId] ?? initialPreferences),
            activeWorkspaceId: workspaceId,
          },
        },
      }));
      setEntries(target.entries);
      setProjects(target.projects);
      setClients(target.clients);
      setMembers(
        target.memberships
          .map((item) => membershipToMember(item, account.identities))
          .filter((member): member is Member => member !== null),
      );
      setSettingsState(target.settings);
      setTrelloState(target.trello);
      const nextTimer = initialTimer;
      timerRevisionRef.current += 1;

      timerRef.current = nextTimer;
      setTimer(nextTimer);
      setElapsed(elapsedForTimer(nextTimer));
      return { success: true };
    };

    const createWorkspace = async (
      name: string,
      billing: BillingPreference,
      logoDataUrl?: string | null,
    ): Promise<StoreResult> => {
      if (sessionStatus !== "active" || !authenticatedUserId)
        return { success: false, error: "Choose an active account." };
      if (workspaceCreationRef.current?.scope === accountScope)
        return workspaceCreationRef.current.promise;
      if (timerRef.current.status !== "idle")
        return {
          success: false,
          error: "Pause or stop the active timer before creating a workspace.",
        };
      if (
        account.workspaces.filter((data) => data.workspace.ownerId === activeMemberId).length >= 5
      )
        return { success: false, error: "You can create up to 5 workspaces." };
      const trimmedName = name.trim();
      if (!trimmedName) return { success: false, error: "A workspace name is required." };
      if (!isFiniteNumber(billing.hourlyRate) || billing.hourlyRate < 0) {
        return { success: false, error: "Choose a valid hourly rate." };
      }
      if (!isCurrencyCode(billing.currency)) {
        return { success: false, error: "Choose a valid currency." };
      }
      if (logoDataUrl !== undefined && !isValidLogoUrl(logoDataUrl)) {
        return { success: false, error: "Choose a PNG, JPG or WebP logo smaller than 500 KB." };
      }
      if (
        account.workspaces.some(
          (data) => data.workspace.name.toLowerCase() === trimmedName.toLowerCase(),
        )
      )
        return { success: false, error: "A workspace with this name already exists." };
      // Creation shares the account write queue. Older snapshots must finish
      // before the server selects the new workspace; later saves use its ID.
      const request = persistAccount().then(async (saved): Promise<StoreResult> => {
        if (!saved || accountScopeRef.current !== accountScope)
          return { success: false, error: "Could not save your pending changes." };
        const result = await dataSource.createWorkspace({
          name: trimmedName,
          hourlyRate: billing.hourlyRate,
          currency: billing.currency,
          ...(logoDataUrl !== undefined ? { logoDataUrl } : {}),
        });
        if (accountScopeRef.current !== accountScope)
          return { success: false, error: "Choose an active account." };
        if (!result.success) return { success: false, error: result.error };
        const created = result.data.account.workspaces.find(
          (data) => data.workspace.id === result.data.workspaceId,
        );
        if (!created) return { success: false, error: "This workspace could not be found." };
        const mergeCreated = (snapshot: PersistedAccount): PersistedAccount => ({
          ...snapshot,
          workspaces: [
            ...snapshot.workspaces.filter((data) => data.workspace.id !== created.workspace.id),
            created,
          ],
          preferencesByUserId: {
            ...snapshot.preferencesByUserId,
            [authenticatedUserId]: {
              ...(snapshot.preferencesByUserId[authenticatedUserId] ?? initialPreferences),
              activeWorkspaceId: created.workspace.id,
            },
          },
        });
        // Keep edits made in the previous workspace while the request was pending.
        const next = mergeCreated(accountForSyncRef.current);
        syncedAccountRef.current = mergeCreated(
          syncedAccountRef.current ?? accountForSyncRef.current,
        );
        accountForSyncRef.current = next;
        accountRef.current = next;
        setAccount(next);
        setActiveWorkspaceId(created.workspace.id);
        setEntries(created.entries);
        setProjects(created.projects);
        setClients(created.clients);
        setMembers(
          created.memberships
            .map((membership) => membershipToMember(membership, next.identities))
            .filter((member): member is Member => member !== null),
        );
        setSettingsState(created.settings);
        setTrelloState(created.trello);
        timerRevisionRef.current += 1;
        timerRef.current = initialTimer;
        setTimer(initialTimer);
        setTimerHydrated(false);
        setAccountError(null);
        return { success: true, id: created.workspace.id };
      });
      const tracked = request
        .then(() => undefined)
        .finally(() => {
          if (accountSyncPromiseRef.current === tracked) accountSyncPromiseRef.current = null;
          if (workspaceCreationRef.current?.promise === request)
            workspaceCreationRef.current = null;
        });
      accountSyncPromiseRef.current = tracked;
      workspaceCreationRef.current = { scope: accountScope, promise: request };
      return request;
    };

    const updateWorkspace = (
      workspaceId: string,
      patch: { name?: string; logoDataUrl?: string | null },
    ): StoreResult => {
      const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
      if (!target) return { success: false, error: "This workspace could not be found." };
      const membership = target.memberships.find((item) => item.userId === activeMemberId);
      if (!membership || membership.role !== "Owner" || membership.status !== "active")
        return { success: false, error: "Only the workspace Owner can edit it." };
      if (target.workspace.status === "archived")
        return { success: false, error: "Archived workspaces are read-only. Restore it first." };
      const name = patch.name === undefined ? target.workspace.name : patch.name.trim();
      if (!name) return { success: false, error: "A workspace name is required." };
      if (patch.logoDataUrl !== undefined && !isValidLogoUrl(patch.logoDataUrl))
        return { success: false, error: "Choose a PNG, JPG or WebP logo smaller than 500 KB." };
      setAccount((current) => ({
        ...current,
        workspaces: current.workspaces.map((data) =>
          data.workspace.id === workspaceId
            ? {
                ...data,
                workspace: {
                  ...data.workspace,
                  name,
                  ...(patch.logoDataUrl !== undefined ? { logoDataUrl: patch.logoDataUrl } : {}),
                },
              }
            : data,
        ),
      }));
      return { success: true };
    };

    const setWorkspaceBilling = (workspaceId: string, billing: BillingPreference): StoreResult => {
      const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
      if (!target) return { success: false, error: "This workspace could not be found." };
      const membership = target.memberships.find((item) => item.userId === activeMemberId);
      if (!membership || membership.status !== "active") {
        return { success: false, error: "You do not have access to this workspace." };
      }
      if (target.workspace.status === "archived") {
        return { success: false, error: "Archived workspaces are read-only. Restore it first." };
      }
      if (!isFiniteNumber(billing.hourlyRate) || billing.hourlyRate < 0) {
        return { success: false, error: "Choose a valid hourly rate." };
      }
      if (!isCurrencyCode(billing.currency)) {
        return { success: false, error: "Choose a valid currency." };
      }
      setAccount((current) => ({
        ...current,
        workspaces: current.workspaces.map((data) =>
          data.workspace.id === workspaceId
            ? {
                ...data,
                memberships: data.memberships.map((item) =>
                  item.userId === activeMemberId ? { ...item, ...billing } : item,
                ),
              }
            : data,
        ),
      }));
      return { success: true };
    };

    const archiveWorkspace = (workspaceId: string): StoreResult => {
      const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
      if (!target) return { success: false, error: "This workspace could not be found." };
      const membership = target.memberships.find((item) => item.userId === activeMemberId);
      if (!membership || membership.role !== "Owner" || membership.status !== "active")
        return { success: false, error: "Only the workspace Owner can archive it." };
      if (target.workspace.status === "archived")
        return { success: false, error: "This workspace is already archived." };
      if (timerRef.current.status !== "idle")
        return {
          success: false,
          error: "Pause or stop the active timer before archiving a workspace.",
        };

      const isCurrentWorkspace = workspaceId === activeWorkspaceId;
      const nextWorkspace = isCurrentWorkspace
        ? (account.workspaces.find(
            (data) =>
              data.workspace.id !== workspaceId &&
              data.workspace.status === "active" &&
              data.memberships.some(
                (item) => item.userId === activeMemberId && item.status === "active",
              ),
          ) ?? null)
        : null;
      if (isCurrentWorkspace && !nextWorkspace)
        return {
          success: false,
          error: "Keep at least one active workspace before archiving the current one.",
        };

      const currentSnapshot: WorkspaceData | null = isCurrentWorkspace
        ? {
            ...target,
            entries,
            projects,
            clients,
            memberships: membersToMemberships(activeWorkspaceId, members, target.memberships),
            settings,
            trello,
          }
        : null;
      const archivedAt = new Date().toISOString();
      setAccount((current) => ({
        ...current,
        workspaces: current.workspaces.map((data) => {
          if (data.workspace.id !== workspaceId) return data;
          const source = currentSnapshot ?? data;
          return {
            ...source,
            workspace: {
              ...source.workspace,
              status: "archived",
              archivedAt,
            },
          };
        }),
      }));

      if (nextWorkspace) {
        setActiveWorkspaceId(nextWorkspace.workspace.id);
        setAccount((currentAccount) => ({
          ...currentAccount,
          preferencesByUserId: {
            ...currentAccount.preferencesByUserId,
            [activeMemberId]: {
              ...(currentAccount.preferencesByUserId[activeMemberId] ?? initialPreferences),
              activeWorkspaceId: nextWorkspace.workspace.id,
            },
          },
        }));
        setEntries(nextWorkspace.entries);
        setProjects(nextWorkspace.projects);
        setClients(nextWorkspace.clients);
        setMembers(
          nextWorkspace.memberships
            .map((item) => membershipToMember(item, account.identities))
            .filter((member): member is Member => member !== null),
        );
        setSettingsState(nextWorkspace.settings);
        setTrelloState(nextWorkspace.trello);
        const nextTimer = initialTimer;
        timerRevisionRef.current += 1;

        timerRef.current = nextTimer;
        setTimer(nextTimer);
        setElapsed(elapsedForTimer(nextTimer));
      }
      return { success: true };
    };

    const restoreWorkspace = (workspaceId: string): StoreResult => {
      const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
      if (!target) return { success: false, error: "This workspace could not be found." };
      const membership = target.memberships.find((item) => item.userId === activeMemberId);
      if (!membership || membership.role !== "Owner")
        return { success: false, error: "Only the workspace Owner can restore it." };
      setAccount((current) => ({
        ...current,
        workspaces: current.workspaces.map((data) =>
          data.workspace.id === workspaceId
            ? (() => {
                const { archivedAt: _archivedAt, ...workspace } = data.workspace;
                return { ...data, workspace: { ...workspace, status: "active" as const } };
              })()
            : data,
        ),
      }));
      return { success: true };
    };

    const leaveWorkspace = (workspaceId: string): StoreResult => {
      const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
      const membership = target?.memberships.find((item) => item.userId === activeMemberId);
      if (!target || !membership || membership.status !== "active")
        return { success: false, error: "You are not an active member of this workspace." };
      if (membership.role === "Owner")
        return {
          success: false,
          error: "The Owner must archive the workspace instead of leaving it.",
        };
      if (timerRef.current.status !== "idle")
        return {
          success: false,
          error: "Pause or stop the active timer before leaving a workspace.",
        };
      const accessible = account.workspaces.filter(
        (data) =>
          data.workspace.id !== workspaceId &&
          data.memberships.some(
            (item) => item.userId === activeMemberId && item.status === "active",
          ),
      );
      if (accessible.length === 0)
        return {
          success: false,
          error: "Keep at least one workspace available before leaving this one.",
        };
      const nextWorkspace = accessible[0];
      if (!nextWorkspace) return { success: false, error: "No other workspace is available." };
      setAccount((current) => ({
        ...current,
        workspaces: current.workspaces.map((data) =>
          data.workspace.id === workspaceId
            ? {
                ...data,
                memberships: data.memberships.map((item) =>
                  item.userId === activeMemberId ? { ...item, status: "removed" } : item,
                ),
                projects: data.projects.map((project) => ({
                  ...project,
                  memberIds: project.memberIds.filter((id) => id !== activeMemberId),
                })),
              }
            : data,
        ),
      }));
      setActiveWorkspaceId(nextWorkspace.workspace.id);
      setAccount((currentAccount) => ({
        ...currentAccount,
        preferencesByUserId: {
          ...currentAccount.preferencesByUserId,
          [activeMemberId]: {
            ...(currentAccount.preferencesByUserId[activeMemberId] ?? initialPreferences),
            activeWorkspaceId: nextWorkspace.workspace.id,
          },
        },
      }));
      setEntries(nextWorkspace.entries);
      setProjects(nextWorkspace.projects);
      setClients(nextWorkspace.clients);
      setMembers(
        nextWorkspace.memberships
          .map((item) => membershipToMember(item, account.identities))
          .filter((member): member is Member => member !== null),
      );
      setSettingsState(nextWorkspace.settings);
      setTrelloState(nextWorkspace.trello);
      const nextTimer = initialTimer;
      timerRevisionRef.current += 1;

      timerRef.current = nextTimer;
      setTimer(nextTimer);
      setElapsed(elapsedForTimer(nextTimer));
      return { success: true };
    };

    const setActiveMember = (memberId: string): StoreResult => {
      const member = members.find(
        (candidate) => candidate.id === memberId && candidate.status === "active",
      );
      if (!member) return { success: false, error: "Choose an active account in this workspace." };
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before changing accounts." };
      const nextTimer = initialTimer;
      timerRevisionRef.current += 1;

      timerRef.current = nextTimer;
      setTimer(nextTimer);
      setElapsed(elapsedForTimer(nextTimer));
      setTimerHydrated(false);
      setActiveMemberId(memberId);
      return { success: true };
    };

    const signOut = (): StoreResult => {
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before signing out." };
      resetSessionDefaultAvatar();
      setSessionStatus("signed-out");
      return { success: true };
    };

    const resumeSession = (memberId: string): StoreResult => {
      const member = members.find(
        (candidate) => candidate.id === memberId && candidate.status === "active",
      );
      if (!member) return { success: false, error: "Choose an active account." };
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before changing accounts." };
      resetSessionDefaultAvatar();
      const nextTimer = initialTimer;
      timerRevisionRef.current += 1;

      timerRef.current = nextTimer;
      setTimer(nextTimer);
      setElapsed(elapsedForTimer(nextTimer));
      setActiveMemberId(memberId);
      setSessionStatus("active");
      return { success: true };
    };

    const summaries: WorkspaceSummary[] = account.workspaces
      .filter((data) =>
        data.memberships.some((item) => item.userId === activeMemberId && item.status === "active"),
      )
      .map((data) => {
        const membership = data.memberships.find((item) => item.userId === activeMemberId)!;
        const owner = account.identities.find((identity) => identity.id === data.workspace.ownerId);
        return {
          ...data.workspace,
          ownerName: owner?.name ?? "Unknown owner",
          role: membership.role,
          membershipStatus: membership.status,
          isOwned: data.workspace.ownerId === activeMemberId,
          hourlyRate: membership.hourlyRate,
          currency: membership.currency,
        };
      });

    return {
      entries,
      projects,
      clients,
      members,
      timer,
      recentTasks,
      trello,
      settings,
      preferences,
      preferencesByUserId: account.preferencesByUserId,
      workspaceBilling,
      billingPreferencesByUserId,
      currentMember,
      currentWorkspace,
      currentWorkspaceMembership,
      workspaces: summaries,
      activeWorkspaceId,
      sessionStatus,
      accountLoading,
      accountError: accountError ?? timerPersistenceError,
      retryAccountLoad,
      can,
      canTrackProject,
      findEntryConflict,
      setActiveMember,
      currentUserId: activeMemberId,
      today,
      startTimer,
      startTimerFromTask,
      updateTimer,
      setTimerElapsed,
      pauseTimer,
      resumeTimer,
      stopTimer,
      addEntry,
      updateEntry,
      deleteEntry,
      restoreEntry,
      addProject,
      updateProject,
      deleteProject,
      addClient,
      updateClient,
      deleteClient,
      inviteMember,
      resendInvite,
      cancelInvite,
      removeMember,
      restoreMember,
      updateMemberRole,
      setTrello,
      setWorkspaceSettings,
      setUserPreferences,
      saveUserPreferences,
      updateCurrentMemberName,
      updateCurrentMemberEmail,
      switchWorkspace,
      createWorkspace,
      setWorkspaceBilling,
      updateWorkspace,
      archiveWorkspace,
      restoreWorkspace,
      leaveWorkspace,
      signOut,
      resumeSession,
    };
  }, [
    account,
    accountError,
    accountLoading,
    accountScope,
    activeMemberId,
    activeWorkspaceId,
    clients,
    currentMember,
    currentWorkspaceMembership,
    currentWorkspace,
    dataSource,
    entries,
    members,
    preferences,
    workspaceBilling,
    billingPreferencesByUserId,
    projects,
    recentTasks,
    persistAccount,
    retryAccountLoad,
    authenticatedUserId,
    sessionStatus,
    settings,
    timer,
    timerPersistenceError,
    today,
    trello,
  ]);

  const tickerValue = useMemo(() => ({ elapsed }), [elapsed]);

  return (
    <StoreContext.Provider value={value}>
      <TimerTickerContext.Provider value={tickerValue}>{children}</TimerTickerContext.Provider>
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}

export function useTimerTicker(): { elapsed: number } {
  const context = useContext(TimerTickerContext);
  if (!context) throw new Error("useTimerTicker must be used inside StoreProvider");
  return context;
}

export function useProjectName(): (id: string | null) => string {
  const { projects } = useStore();
  return (id: string | null) =>
    id === null
      ? "No project"
      : (projects.find((project) => project.id === id)?.name ?? "Unknown project");
}
