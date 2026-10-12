import { isFavoriteTasks } from "../favorite-tasks";

import type {
  PersistedAccount,
  ThemeMode,
  UserPreferences,
  WorkspaceSettings,
} from "../account-types";

import type { Client, Project, TimeEntry } from "../domain";

import { getElapsedSeconds, isValidDateOnly } from "../format";

import { isLocale } from "../i18n";

import { isDefaultAvatarUrl } from "../default-avatar";

import { clientCurrencyOptions, isCurrencyCode } from "../billing";

import { parseStoredReportFiltersValue } from "../report-filter-storage";

import { isValidTimeZone } from "./preferences";

export function isValidClock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function isValidAvatarUrl(value: unknown): value is string | null {
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

export function isValidLogoUrl(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      ((/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value) &&
        value.length <= 900_000) ||
        /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/sign\/workspace-logos\//.test(value)))
  );
}

export function isValidPreferences(value: unknown): value is UserPreferences {
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

export function isValidSettings(value: unknown): value is WorkspaceSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<WorkspaceSettings>;
  return settings.weekStart === "monday" || settings.weekStart === "sunday";
}

export function isValidClient(value: unknown): value is Client {
  if (!value || typeof value !== "object") return false;
  const client = value as Partial<Client>;
  return (
    typeof client.id === "string" &&
    typeof client.name === "string" &&
    Boolean(client.name.trim()) &&
    typeof client.contact === "string" &&
    (client.status === undefined || ["active", "on-hold", "archived"].includes(client.status)) &&
    (client.memberIds === undefined ||
      (Array.isArray(client.memberIds) &&
        client.memberIds.every((id) => typeof id === "string"))) &&
    (client.billable === undefined || typeof client.billable === "boolean") &&
    (client.currency === undefined || clientCurrencyOptions.includes(client.currency)) &&
    (client.contractedHours == null ||
      (typeof client.contractedHours === "number" &&
        Number.isFinite(client.contractedHours) &&
        client.contractedHours > 0))
  );
}

export function isValidProject(value: unknown, clients: Client[]): value is Project {
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

export function normalizedProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isValidEntry(value: unknown, projects: Project[]): value is TimeEntry {
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
