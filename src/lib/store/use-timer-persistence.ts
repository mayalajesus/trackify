import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { AccountDataSource } from "../account-data-source";
import { validateTimerDetails } from "../timer-start";
import { initialTimer } from "./defaults";
import { elapsedForTimer } from "./timer";
import {
  isTimerAcknowledged,
  resolveTimerHydration,
  type AccountScope,
  type PersistedTimer,
} from "./timer-persistence";
import type { TimerState } from "./types";

type TimerPersistenceOptions = {
  authenticatedUserId: string;
  activeMemberId: string;
  activeWorkspaceId: string;
  accountScope: AccountScope;
  accountScopeRef: RefObject<AccountScope>;
  dataSource: AccountDataSource;
  hydrated: boolean;
  timer: TimerState;
  timerRef: RefObject<TimerState>;
  timerRevisionRef: RefObject<number>;
  persistedTimerRef: RefObject<PersistedTimer | null>;
  timerSyncPromiseRef: RefObject<Promise<void> | null>;
  timerHydrated: boolean;
  setTimerHydrated: Dispatch<SetStateAction<boolean>>;
  setTimerPersistenceError: Dispatch<SetStateAction<string | null>>;
  setTimer: Dispatch<SetStateAction<TimerState>>;
  setElapsed: Dispatch<SetStateAction<number>>;
  refreshAccount: () => Promise<boolean>;
  persistAccount: () => Promise<boolean>;
  timerLoadRetryKey: number;
  timerSaveRetryKey: number;
};

export function useTimerPersistence({
  authenticatedUserId,
  activeMemberId,
  activeWorkspaceId,
  accountScope,
  accountScopeRef,
  dataSource,
  hydrated,
  timer,
  timerRef,
  timerRevisionRef,
  persistedTimerRef,
  timerSyncPromiseRef,
  timerHydrated,
  setTimerHydrated,
  setTimerPersistenceError,
  setTimer,
  setElapsed,
  refreshAccount,
  persistAccount,
  timerLoadRetryKey,
  timerSaveRetryKey,
}: TimerPersistenceOptions) {
  const hydrationRef = useRef<{
    scope: AccountScope;
    workspaceId: string;
    revision: number;
  } | null>(null);
  useEffect(() => {
    if (!hydrated || !authenticatedUserId || !activeWorkspaceId) return;
    let cancelled = false;
    setTimerHydrated(false);
    setTimerPersistenceError(null);
    if (
      hydrationRef.current?.scope !== accountScope ||
      hydrationRef.current.workspaceId !== activeWorkspaceId
    ) {
      hydrationRef.current = {
        scope: accountScope,
        workspaceId: activeWorkspaceId,
        revision: timerRevisionRef.current,
      };
    }
    // Keep the first revision across failed reads and retries. A retry must not
    // redefine an unsaved local timer as the initial, replaceable state.
    const timerRevision = hydrationRef.current.revision;
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
      const recovery = resolveTimerHydration(
        timerRef.current,
        hydratedTimer,
        timerRevisionRef.current !== timerRevision,
      );
      if (!recovery.success) {
        setTimerPersistenceError(recovery.error);
        return;
      }
      timerRef.current = recovery.timer;
      setTimer(recovery.timer);
      setTimerPersistenceError(null);
      setTimerHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accountScope,
    activeMemberId,
    activeWorkspaceId,
    dataSource,
    hydrated,
    authenticatedUserId,
    timerLoadRetryKey,
    accountScopeRef,
    persistedTimerRef,
    setTimer,
    setTimerHydrated,
    setTimerPersistenceError,
    timerRef,
    timerRevisionRef,
    timerSyncPromiseRef,
  ]);

  useEffect(() => {
    if (!timerHydrated || !authenticatedUserId || !activeWorkspaceId) return;
    let cancelled = false;
    let checking = false;
    const checkRemoteTimer = async () => {
      if (
        checking ||
        cancelled ||
        document.visibilityState !== "visible" ||
        timerSyncPromiseRef.current ||
        !isTimerAcknowledged(
          timerRef.current,
          persistedTimerRef.current,
          accountScope,
          activeWorkspaceId,
        )
      )
        return;
      checking = true;
      const revision = timerRevisionRef.current;
      try {
        const result = await dataSource.getActiveTimer(authenticatedUserId, activeWorkspaceId);
        if (
          cancelled ||
          accountScopeRef.current !== accountScope ||
          timerRevisionRef.current !== revision ||
          !result.success
        )
          return;
        if (result.data) {
          if (JSON.stringify(timerRef.current) !== JSON.stringify(result.data)) {
            persistedTimerRef.current = {
              scope: accountScope,
              workspaceId: activeWorkspaceId,
              value: JSON.stringify(result.data),
            };
            timerRevisionRef.current += 1;
            timerRef.current = result.data;
            setTimer(result.data);
            setElapsed(elapsedForTimer(result.data));
          }
          return;
        }
        if (timerRef.current.status === "idle") return;
        // Refresh the entries before replacing the local timer. Do not turn the
        // new server entry into a stale client-side deletion on the next save.
        if (!(await refreshAccount()) || cancelled || timerRevisionRef.current !== revision) return;
        persistedTimerRef.current = {
          scope: accountScope,
          workspaceId: activeWorkspaceId,
          value: JSON.stringify(initialTimer),
        };
        timerRevisionRef.current += 1;
        timerRef.current = initialTimer;
        setTimer(initialTimer);
        setElapsed(0);
        setTimerPersistenceError(null);
      } finally {
        checking = false;
      }
    };
    const check = () => {
      void checkRemoteTimer();
    };
    const interval = window.setInterval(check, 3000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [
    timerHydrated,
    authenticatedUserId,
    activeWorkspaceId,
    timer.collaborationOwnerId,
    accountScope,
    dataSource,
    refreshAccount,
    accountScopeRef,
    persistedTimerRef,
    setElapsed,
    setTimer,
    setTimerPersistenceError,
    timerRef,
    timerRevisionRef,
    timerSyncPromiseRef,
  ]);

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
        if (isTimerAcknowledged(timer, persistedTimerRef.current, accountScope, activeWorkspaceId))
          return;
        // Save project/entry changes before the timer references them or is cleared.
        if (!(await persistAccount()) || !isCurrent()) return;
        const acknowledged = persistedTimerRef.current;
        const expected =
          acknowledged?.scope === accountScope && acknowledged.workspaceId === activeWorkspaceId
            ? (JSON.parse(acknowledged.value) as TimerState)
            : undefined;
        const result =
          timer.status === "idle"
            ? await dataSource.clearActiveTimer(authenticatedUserId, activeWorkspaceId, expected)
            : await dataSource.saveActiveTimer(authenticatedUserId, timer, expected);
        if (accountScopeRef.current !== accountScope) return;
        if (!result.success) {
          // Keep the baseline after errors; dropping it would let retry overwrite
          // a timer changed by another tab without its precondition.
          if (isCurrent()) setTimerPersistenceError(result.error);
          return;
        }
        // Even an obsolete in-flight save changed the server. The next queued
        // operation must see that result (especially a stop following a start).
        const canonical = result.data ?? timer;
        persistedTimerRef.current = {
          scope: accountScope,
          workspaceId: activeWorkspaceId,
          value: JSON.stringify(canonical),
        };
        if (isCurrent()) {
          if (JSON.stringify(canonical) !== value) {
            timerRef.current = canonical;
            setTimer(canonical);
          }
          setTimerPersistenceError(null);
        }
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
    timerSaveRetryKey,
    setTimer,
    timerRef,
    accountScopeRef,
    persistedTimerRef,
    setTimerPersistenceError,
    timerSyncPromiseRef,
  ]);
}
