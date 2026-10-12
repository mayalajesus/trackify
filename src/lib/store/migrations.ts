import type {
  PersistedAccount,
  UserIdentity,
  UserPreferences,
  WorkspaceData,
  WorkspaceMembership,
} from "../account-types";
import { defaultCurrencyForLocale, isCurrencyCode, type BillingPreference } from "../billing";
import { isFavoriteTasks } from "../favorite-tasks";
import { isLocale } from "../i18n";
import { parseStoredReportFiltersValue, type StoredReportFilters } from "../report-filter-storage";
import { getInitialTimeZone, isValidTimeZone } from "./preferences";
import {
  isFiniteNumber,
  isRecord,
  isThemeMode,
  isValidAccount,
  isValidAvatarUrl,
} from "./validation";

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
