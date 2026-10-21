import type { PersistedAccount } from "../account-types";
import type { TimerState } from "./types";
import { accountsEqual, mergeAccountChanges } from "../../../shared/account-merge.mjs";
import { isValidAccount } from "./validation";

export type RecoveryDraft = {
  id: string;
  version: 1;
  userId: string;
  updatedAt: string;
  account: PersistedAccount;
  baseline: PersistedAccount;
  workspaceId: string;
  timer: TimerState;
  timerBaseline: TimerState | null;
  timerPending: boolean;
  archived?: boolean;
  serverAtRecovery?: PersistedAccount;
};

// One record per page instance, never a shared last-writer-wins snapshot.
// Acknowledging one tab must not remove another tab's pending work.
export function openRecoveryJournal() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("trackify-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Feche outras abas para abrir a recuperação local."));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function journalRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openRecoveryJournal();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("drafts", mode, { durability: "strict" });
      const request = action(tx.objectStore("drafts"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
}

export const writeRecoveryDraft = (draft: RecoveryDraft) =>
  journalRequest("readwrite", (store) => store.put(draft));
export const removeRecoveryDraft = (id: string) =>
  journalRequest("readwrite", (store) => store.delete(id));
export async function archiveSourceIfUnchanged(draft: RecoveryDraft) {
  const db = await openRecoveryJournal();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite", { durability: "strict" });
      const store = tx.objectStore("drafts");
      const request = store.get(draft.id);
      request.onsuccess = () => {
        if (JSON.stringify(request.result) === JSON.stringify(draft))
          store.put({ ...draft, archived: true });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function listRecoveryDrafts(userId: string) {
  const drafts = await journalRequest<RecoveryDraft[]>("readonly", (store) => store.getAll());
  return drafts.filter((draft) => draft.version === 1 && draft.userId === userId);
}

export type RecoveryConflict = { path: string; local: unknown; remote: unknown; blocked: boolean };
export type RecoveryChoice = "local" | "remote";
export function parseRecoveryDraft(text: string, userId: string): RecoveryDraft {
  if (text.length > 20_000_000) throw new Error("O arquivo de recuperação é muito grande.");
  try {
    return parseRecoveryPayload(text, userId);
  } catch {
    throw new Error("Este arquivo não é um rascunho válido desta conta.");
  }
}
function parseRecoveryPayload(text: string, userId: string): RecoveryDraft {
  const value = JSON.parse(text) as Partial<RecoveryDraft>;
  const timer = value?.timer;
  if (
    value?.version !== 1 ||
    value.userId !== userId ||
    !isValidAccount(value.account) ||
    !isValidAccount(value.baseline) ||
    typeof value.workspaceId !== "string" ||
    !timer ||
    !["idle", "running", "paused"].includes(timer.status) ||
    typeof timer.task !== "string" ||
    typeof timer.billable !== "boolean" ||
    !Number.isFinite(timer.accumulated) ||
    timer.accumulated < 0 ||
    (timer.startedAt !== null && (!Number.isFinite(timer.startedAt) || timer.startedAt < 0)) ||
    (timer.workspaceId !== null && timer.workspaceId !== value.workspaceId) ||
    (timer.projectId !== null && typeof timer.projectId !== "string") ||
    typeof timer.startClock !== "string" ||
    typeof value.timerPending !== "boolean"
  )
    throw new Error("Este arquivo não é um rascunho válido desta conta.");
  // An imported timer has no trusted server acknowledgement. Never replace a
  // remote timer using an unverified baseline supplied by a file.
  return {
    id: `${userId}:import:${crypto.randomUUID()}`,
    version: 1,
    userId,
    updatedAt: new Date().toISOString(),
    account: value.account,
    baseline: value.baseline,
    workspaceId: value.workspaceId,
    timer,
    timerBaseline: null,
    timerPending: value.timerPending,
  };
}
export function planRecovery(
  draft: RecoveryDraft,
  remote: PersistedAccount,
  choices: Record<string, RecoveryChoice> = {},
) {
  const conflicts: RecoveryConflict[] = [];
  const account = mergeAccountChanges(draft.baseline, draft.account, remote, {
    resolveConflict: ({ path, local, remote: value }) => {
      const key = path.join(".");
      // Never recreate deleted workspaces/memberships or restore revoked access.
      const blocked =
        path[0] === "workspaces" && (path.length <= 2 || path.includes("memberships"));
      conflicts.push({ path: key, local, remote: value, blocked });
      return !blocked && choices[key] === "local" ? local : value;
    },
  });
  return { account, conflicts };
}

export function canRecoverTimer(draft: RecoveryDraft, remote: TimerState) {
  // Unknown baselines and changes on another device require manual review.
  return (
    !draft.timerPending ||
    accountsEqual(draft.timer, remote) ||
    (draft.timerBaseline !== null && accountsEqual(draft.timerBaseline, remote))
  );
}
