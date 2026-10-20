import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { accountsEqual } from "../../../shared/account-merge.mjs";
import type { AccountDataSource } from "../account-data-source";
import type { PersistedAccount } from "../account-types";
import { createAccountPersistence } from "./account-persistence";
import type { TimerState } from "./types";

import { isTimerAcknowledged, type AccountScope, type PersistedTimer } from "./timer-persistence";

export function useAccountPersistence({
  userId,
  dataSource,
  scope,
  scopeRef,
  snapshotRef,
  syncedRef,
  queueRef,
  timerRef,
  timerQueueRef,
  persistedTimerRef,
  activeWorkspaceId,
  timerError,
  hydrated,
  timerHydrated,
  onSaved,
}: {
  userId: string;
  dataSource: AccountDataSource;
  scope: AccountScope;
  scopeRef: RefObject<AccountScope>;
  snapshotRef: RefObject<PersistedAccount>;
  syncedRef: RefObject<PersistedAccount | null>;
  queueRef: RefObject<Promise<void> | null>;
  timerRef: RefObject<TimerState>;
  timerQueueRef: RefObject<Promise<void> | null>;
  persistedTimerRef: RefObject<PersistedTimer | null>;
  activeWorkspaceId: string;
  timerError: string | null;
  hydrated: boolean;
  timerHydrated: boolean;
  onSaved: (account: PersistedAccount) => void;
}) {
  const [accountPersistenceError, setAccountPersistenceError] = useState<string | null>(null);
  const [timerSaveRetryKey, setTimerSaveRetryKey] = useState(0);
  const [timerLoadRetryKey, setTimerLoadRetryKey] = useState(0);
  const persistAccount = useMemo(
    () =>
      createAccountPersistence({
        userId,
        dataSource,
        isCurrent: () => scopeRef.current === scope,
        snapshotRef,
        syncedRef,
        queueRef,
        onSaved,
        onError: setAccountPersistenceError,
      }),
    [userId, dataSource, scope, scopeRef, snapshotRef, syncedRef, queueRef, onSaved],
  );

  const retryAccountSave = useCallback(() => {
    void persistAccount().then((saved) => {
      if (saved && scopeRef.current === scope) {
        if (timerHydrated) setTimerSaveRetryKey((key) => key + 1);
        else setTimerLoadRetryKey((key) => key + 1);
      }
    });
  }, [persistAccount, scope, scopeRef, timerHydrated]);

  const downloadPendingChanges = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            account: snapshotRef.current,
            baseline: syncedRef.current,
            timer: timerRef.current,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trackify-unsaved-changes.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [snapshotRef, syncedRef, timerRef]);

  useEffect(() => {
    const protectPendingChanges = (event: BeforeUnloadEvent) => {
      if (!userId || !hydrated) return;
      if (
        !accountsEqual(snapshotRef.current, syncedRef.current) ||
        queueRef.current ||
        timerQueueRef.current ||
        timerError ||
        (activeWorkspaceId &&
          (timerRef.current.status !== "idle" || timerHydrated) &&
          !isTimerAcknowledged(
            timerRef.current,
            persistedTimerRef.current,
            scope,
            activeWorkspaceId,
          ))
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protectPendingChanges);
    return () => window.removeEventListener("beforeunload", protectPendingChanges);
  }, [
    userId,
    hydrated,
    snapshotRef,
    syncedRef,
    queueRef,
    timerQueueRef,
    timerError,
    timerRef,
    timerHydrated,
    persistedTimerRef,
    scope,
    activeWorkspaceId,
  ]);

  return {
    persistAccount,
    accountPersistenceError,
    setAccountPersistenceError,
    retryAccountSave,
    downloadPendingChanges,
    timerSaveRetryKey,
    timerLoadRetryKey,
  };
}
