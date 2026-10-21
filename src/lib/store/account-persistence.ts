import { accountsEqual, mergeAccountChanges } from "../../../shared/account-merge.mjs";
import type { AccountDataSource } from "../account-data-source";
import type { PersistedAccount } from "../account-types";

type Ref<T> = { current: T };

export function createAccountPersistence({
  userId,
  dataSource,
  isCurrent,
  snapshotRef,
  syncedRef,
  queueRef,
  onSaved,
  onError,
  beforeSave,
}: {
  userId: string;
  dataSource: Pick<AccountDataSource, "syncAccount">;
  isCurrent: () => boolean;
  snapshotRef: Ref<PersistedAccount>;
  syncedRef: Ref<PersistedAccount | null>;
  queueRef: Ref<Promise<void> | null>;
  onSaved: (account: PersistedAccount) => void;
  onError: (error: string | null) => void;
  beforeSave?: () => Promise<void>;
}) {
  return (): Promise<boolean> => {
    const previous = queueRef.current ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(async () => {
        if (!userId || !isCurrent()) return false;
        const snapshot = snapshotRef.current;
        const baseline = syncedRef.current;
        if (!baseline) return false;
        try {
          await beforeSave?.();
          if (!isCurrent()) return false;
          if (accountsEqual(snapshot, baseline)) {
            onError(null);
            return true;
          }
          const result = await dataSource.syncAccount(userId, snapshot, baseline);
          if (!isCurrent()) return false;
          if (!result.success) {
            onError(result.error);
            return false;
          }
          // An old server may still return null during a rolling deployment.
          // Keep the pending draft rather than acknowledging an unknown state.
          if (!result.data || !Array.isArray(result.data.workspaces)) {
            onError("Reload the app before saving. Your unsaved changes have been kept.");
            return false;
          }
          const next = mergeAccountChanges(snapshot, snapshotRef.current, result.data, {
            keepLocalOnConflict: true,
          });
          syncedRef.current = result.data;
          snapshotRef.current = next;
          onSaved(next);
          onError(null);
          return true;
        } catch (error) {
          if (isCurrent())
            onError(
              error instanceof Error ? error.message : "Could not save your pending changes.",
            );
          return false;
        }
      });
    const tracked = request
      .then(() => undefined)
      .finally(() => {
        if (queueRef.current === tracked) queueRef.current = null;
      });
    queueRef.current = tracked;
    return request;
  };
}
