import type { TimeEntry } from "../domain";
import { dateTimeToTimestamp } from "../format";
import { nextId } from "./ids";
import type { AddEntryOptions, StoreResult } from "./types";

export function createEntryActions({
  can,
  activeMemberId,
  timerRef,
  billableForProject,
  workspaceBilling,
  currencyForProject,
  validateEntry,
  findEntryConflict,
  setEntries,
  entries,
  preferences,
}: {
  can: (permission: import("@/lib/permissions").Permission) => boolean;
  activeMemberId: string;
  timerRef: React.RefObject<import("@/lib/store/types").TimerState>;
  billableForProject: (projectId: string | null) => boolean;
  workspaceBilling: import("@/lib/billing").BillingPreference;
  currencyForProject: (projectId: string | null) => "BRL" | "USD" | "EUR" | "GBP";
  validateEntry: (
    entry: Omit<import("@/lib/domain").TimeEntry, "id">,
    allowExistingProjectId?: string | null | undefined,
  ) => import("@/lib/store/types").StoreResult;
  findEntryConflict: (
    entry: Omit<import("@/lib/domain").TimeEntry, "id">,
    excludedEntryId?: string | undefined,
  ) => import("@/lib/domain").TimeEntry | undefined;
  setEntries: React.Dispatch<React.SetStateAction<import("@/lib/domain").TimeEntry[]>>;
  entries: import("@/lib/domain").TimeEntry[];
  preferences: import("@/lib/account-types").UserPreferences;
}) {
  const addEntry = (entry: Omit<TimeEntry, "id">, options: AddEntryOptions = {}): StoreResult => {
    if (!can("manage-own-entries") || entry.userId !== activeMemberId)
      return { success: false, error: "You can only create your own time entries." };
    if (!options.allowWhileTimerActive && timerRef.current.status !== "idle")
      return { success: false, error: "Stop the active timer before adding time manually." };
    const billedEntry = {
      ...entry,
      billable: billableForProject(entry.projectId),
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
    const warning = conflict ? "This time overlaps another entry. It was saved anyway." : undefined;
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
      billable:
        patch.projectId !== undefined && patch.projectId !== current.projectId
          ? billableForProject(patch.projectId)
          : current.billable,
      ...(patch.projectId !== undefined && patch.projectId !== current.projectId
        ? { currency: currencyForProject(patch.projectId) }
        : {}),
    };
    const timeChanged = ["date", "start", "end", "endDate", "seconds"].some(
      (field) => field in patch,
    );
    if (timeChanged && !("startTimestamp" in patch) && !("endTimestamp" in patch)) {
      const onlyDateChanged =
        "date" in patch && !["start", "end", "endDate", "seconds"].some((field) => field in patch);
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
    const warning = conflict ? "This time overlaps another entry. It was saved anyway." : undefined;
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
    const warning = conflict ? "This time overlaps another entry. It was saved anyway." : undefined;
    setEntries((list) => [entry, ...list]);
    return {
      success: true,
      ...(warning && conflict ? { warning, conflict } : {}),
    };
  };
  return { addEntry, updateEntry, deleteEntry, restoreEntry };
}
