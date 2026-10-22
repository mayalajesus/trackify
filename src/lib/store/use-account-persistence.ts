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
  beforeSave,
  hasConflict,
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
  beforeSave: () => Promise<void>;
  hasConflict: boolean;
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
        beforeSave,
      }),
    [userId, dataSource, scope, scopeRef, snapshotRef, syncedRef, queueRef, onSaved, beforeSave],
  );

  const retryAccountSave = useCallback(() => {
    void persistAccount().then((saved) => {
      if (saved && scopeRef.current === scope) {
        if (timerHydrated) setTimerSaveRetryKey((key) => key + 1);
        else setTimerLoadRetryKey((key) => key + 1);
      }
    });
  }, [persistAccount, scope, scopeRef, timerHydrated]);

  useEffect(() => {
    if (!userId || !hydrated) return;
    let cancelled = false;
    let running = false;
    let delay = 5_000;
    let timeout: ReturnType<typeof setTimeout>;
    const attempt = async () => {
      if (cancelled || running) return;
      clearTimeout(timeout);
      running = true;
      try {
        if (
          navigator.onLine === false ||
          hasConflict ||
          scopeRef.current !== scope ||
          queueRef.current ||
          timerQueueRef.current
        )
          return;
        const pending =
          !accountsEqual(snapshotRef.current, syncedRef.current) ||
          !timerHydrated ||
          !isTimerAcknowledged(
            timerRef.current,
            persistedTimerRef.current,
            scope,
            activeWorkspaceId,
          );
        if (!pending) {
          delay = 5_000;
          return;
        }
        // Uses the same durable journal, serialized writes and atomic server merge
        // as an ordinary save. No baseline is discarded on a failed attempt.
        const saved = await persistAccount();
        if (cancelled || scopeRef.current !== scope) return;
        if (saved) {
          if (timerHydrated) setTimerSaveRetryKey((key) => key + 1);
          else setTimerLoadRetryKey((key) => key + 1);
        }
        delay = Math.min(delay * 2, 60_000);
      } finally {
        running = false;
        if (!cancelled) timeout = setTimeout(() => void attempt(), delay);
      }
    };
    const reconnect = () => {
      delay = 5_000;
      void attempt();
    };
    timeout = setTimeout(() => void attempt(), delay);
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
    };
  }, [
    userId,
    hydrated,
    timerHydrated,
    hasConflict,
    scope,
    scopeRef,
    queueRef,
    timerQueueRef,
    snapshotRef,
    syncedRef,
    timerRef,
    persistedTimerRef,
    activeWorkspaceId,
    persistAccount,
  ]);

  const downloadPendingChanges = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            userId,
            exportedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            account: snapshotRef.current,
            baseline: syncedRef.current,
            workspaceId: activeWorkspaceId,
            timer: timerRef.current,
            timerPending: !isTimerAcknowledged(
              timerRef.current,
              persistedTimerRef.current,
              scope,
              activeWorkspaceId,
            ),
            timerBaseline: null,
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
  }, [snapshotRef, syncedRef, timerRef, userId, activeWorkspaceId, persistedTimerRef, scope]);

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
