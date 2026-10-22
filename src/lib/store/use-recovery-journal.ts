import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { accountsEqual } from "../../../shared/account-merge.mjs";
import type { AccountDataSource } from "../account-data-source";
import type { PersistedAccount } from "../account-types";
import { initialTimer } from "./defaults";
import { isValidAccount } from "./validation";
import { isTimerAcknowledged, type AccountScope, type PersistedTimer } from "./timer-persistence";
import type { TimerState } from "./types";
import { recoverAutomatically } from "./automatic-recovery";
import {
  canRecoverTimer,
  hasPendingRecovery,
  archiveSourceIfUnchanged,
  listRecoveryDrafts,
  planRecovery,
  parseRecoveryDraft,
  removeRecoveryDraft,
  writeRecoveryDraft,
  type RecoveryChoice,
  type RecoveryDraft,
} from "./recovery-journal";

type Options = {
  userId: string;
  hydrated: boolean;
  timerHydrated: boolean;
  workspaceId: string;
  scope: AccountScope;
  scopeRef: RefObject<AccountScope>;
  snapshotRef: RefObject<PersistedAccount>;
  syncedRef: RefObject<PersistedAccount | null>;
  timerRef: RefObject<TimerState>;
  persistedTimerRef: RefObject<PersistedTimer | null>;
  queueRef: RefObject<Promise<void> | null>;
  timerQueueRef: RefObject<Promise<void> | null>;
  dataSource: AccountDataSource;
  onSaved: (account: PersistedAccount) => void;
  onTimerRecovered: (timer: TimerState) => void;
};
export function useRecoveryJournal(options: Options) {
  const pageId = useRef(crypto.randomUUID());
  const latest = useRef(options);
  latest.current = options;
  const writeQueue = useRef(Promise.resolve());
  const lastWritten = useRef("");
  const lastObserved = useRef<unknown[]>([]);
  const applying = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<RecoveryDraft[]>([]);
  const [verifiedPendingIds, setVerifiedPendingIds] = useState<string[]>([]);
  const refreshRevision = useRef(0);
  const refreshing = useRef(false);
  const [currentConflict, setCurrentConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<{
    draft: RecoveryDraft;
    remote: PersistedAccount;
    remoteTimer: TimerState;
    current: string;
  } | null>(null);
  const [choices, setChoices] = useState<Record<string, RecoveryChoice>>({});
  const [keepRemoteTimer, setKeepRemoteTimer] = useState(false);
  const interacting = useRef(false);
  interacting.current = busy || Boolean(review);

  const capture = useCallback((): RecoveryDraft | null => {
    const o = latest.current;
    if (!o.hydrated || !o.userId || !o.syncedRef.current || o.scopeRef.current !== o.scope)
      return null;
    const ack = o.persistedTimerRef.current;
    const timerBaseline =
      o.timerHydrated && ack?.scope === o.scope && ack.workspaceId === o.workspaceId
        ? (JSON.parse(ack.value) as TimerState)
        : null;
    return structuredClone({
      id: `${o.userId}:${pageId.current}:${o.workspaceId}`,
      version: 1,
      userId: o.userId,
      updatedAt: new Date().toISOString(),
      account: o.snapshotRef.current,
      baseline: o.syncedRef.current,
      workspaceId: o.workspaceId,
      timer: o.timerRef.current,
      timerBaseline,
      timerPending:
        (o.timerHydrated || o.timerRef.current.status !== "idle") &&
        !isTimerAcknowledged(o.timerRef.current, ack, o.scope, o.workspaceId),
    });
  }, []);

  const protect = useCallback(async () => {
    if (applying.current) return writeQueue.current;
    const o = latest.current;
    const observed = [
      o.userId,
      o.scope,
      o.workspaceId,
      o.hydrated,
      o.timerHydrated,
      o.snapshotRef.current,
      o.syncedRef.current,
      o.timerRef.current,
      o.persistedTimerRef.current,
    ];
    if (observed.every((value, index) => value === lastObserved.current[index]))
      return writeQueue.current;
    const draft = capture();
    if (!draft) throw new Error("Aguarde o carregamento da conta antes de salvar.");
    const signature = JSON.stringify({ ...draft, updatedAt: "" });
    const work = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (lastWritten.current === signature) return;
        if (!draft.timerPending && accountsEqual(draft.account, draft.baseline))
          await removeRecoveryDraft(draft.id);
        else await writeRecoveryDraft(draft);
        lastWritten.current = signature;
      });
    writeQueue.current = work;
    try {
      await work;
      lastObserved.current = observed;
      setStorageError(null);
    } catch {
      const error =
        "Não foi possível salvar a cópia local. Mantenha esta aba aberta e baixe as alterações antes de sair.";
      setStorageError(error);
      throw new Error(error);
    }
  }, [capture]);

  // Persist every committed edit, before the debounced network write. The network
  // path also awaits protect(), so a storage failure never silently removes a draft.
  useEffect(() => {
    if (options.hydrated) void protect().catch(() => undefined);
  });
  const refreshUnlocked = useCallback(async () => {
    const o = latest.current;
    const revision = ++refreshRevision.current;
    const current = () =>
      latest.current.userId === o.userId &&
      o.scopeRef.current === o.scope &&
      revision === refreshRevision.current;
    if (!o.userId) {
      setDrafts([]);
      setVerifiedPendingIds([]);
      setCurrentConflict(false);
      return;
    }
    let records: RecoveryDraft[];
    try {
      records = (await listRecoveryDrafts(o.userId)).filter(
        (draft) => !draft.id.startsWith(`${o.userId}:${pageId.current}:`),
      );
    } catch {
      if (current())
        setStorageError(
          "Não foi possível consultar os rascunhos locais. Mantenha esta aba aberta.",
        );
      return;
    }
    if (!current()) return;
    setDrafts(records);
    setVerifiedPendingIds([]);
    const pending = records.filter((draft) => !draft.archived);
    const localDraft = capture();
    const localPending =
      localDraft &&
      (localDraft.timerPending || !accountsEqual(localDraft.account, localDraft.baseline));
    if (!o.hydrated || (pending.length === 0 && !localPending)) {
      if (current() && !localPending) setCurrentConflict(false);
      return;
    }
    // Failed reads never discard drafts or assert unsaved changes exist.
    try {
      const account = await o.dataSource.loadAccount(o.userId);
      if (!current() || !account.success) return;
      if (localPending) {
        const localTimer = localDraft.timerPending
          ? await o.dataSource.getActiveTimer(o.userId, o.workspaceId)
          : { success: true as const, data: initialTimer };
        if (!current()) return;
        if (localTimer.success) {
          const plan = planRecovery(localDraft, account.data);
          setCurrentConflict(
            plan.conflicts.length > 0 ||
              !canRecoverTimer(localDraft, localTimer.data ?? initialTimer),
          );
        }
      } else setCurrentConflict(false);
      const verified: string[] = [];
      for (const draft of pending) {
        const timer = draft.timerPending
          ? await o.dataSource.getActiveTimer(o.userId, draft.workspaceId)
          : { success: true as const, data: initialTimer };
        if (!current()) return;
        if (!timer.success) continue;
        if (hasPendingRecovery(draft, account.data, timer.data ?? initialTimer)) {
          const plan = planRecovery(draft, account.data);
          if (
            plan.conflicts.length ||
            !isValidAccount(plan.account) ||
            !canRecoverTimer(draft, timer.data ?? initialTimer)
          ) {
            verified.push(draft.id);
            continue;
          }
          const snapshot = o.snapshotRef.current;
          const activeTimer = o.timerRef.current;
          const safeToRecover = () =>
            current() &&
            latest.current.timerHydrated &&
            !interacting.current &&
            !applying.current &&
            !o.queueRef.current &&
            !o.timerQueueRef.current &&
            o.snapshotRef.current === snapshot &&
            o.timerRef.current === activeTimer &&
            accountsEqual(snapshot, o.syncedRef.current) &&
            isTimerAcknowledged(activeTimer, o.persistedTimerRef.current, o.scope, o.workspaceId);
          if (!safeToRecover()) continue;
          const result = await recoverAutomatically(draft, o.dataSource, safeToRecover);
          if (!current()) return;
          if (result.status === "conflict") verified.push(draft.id);
          if (result.status !== "saved") continue;
          await archiveSourceIfUnchanged(draft);
          if (safeToRecover()) {
            o.syncedRef.current = result.account;
            o.snapshotRef.current = result.account;
            o.onSaved(result.account);
            if (draft.timerPending && draft.workspaceId === o.workspaceId) {
              o.persistedTimerRef.current = {
                scope: o.scope,
                workspaceId: o.workspaceId,
                value: JSON.stringify(result.timer),
              };
              o.onTimerRecovered(result.timer);
            }
          }
          // Let ordinary persistence and UI settle before processing another draft.
          break;
        } else {
          // Preserve the exact original; never archive a newer edit from another tab.
          await archiveSourceIfUnchanged(draft);
        }
      }
      const refreshed = await listRecoveryDrafts(o.userId);
      if (current()) {
        setDrafts(
          refreshed.filter((draft) => !draft.id.startsWith(`${o.userId}:${pageId.current}:`)),
        );
        setVerifiedPendingIds(verified);
      }
    } catch {
      // Transient server failures leave originals available for download.
    }
  }, [capture]);
  const refresh = useCallback(async () => {
    if (refreshing.current || navigator.onLine === false || interacting.current) return;
    refreshing.current = true;
    try {
      if (navigator.locks) {
        await navigator.locks.request(
          `trackify-recovery:${latest.current.userId}`,
          { ifAvailable: true },
          async (lock) => {
            if (lock) await refreshUnlocked();
          },
        );
      } else await refreshUnlocked();
    } finally {
      refreshing.current = false;
    }
  }, [refreshUnlocked]);
  useEffect(() => {
    void refresh();
    const check = () => {
      void refresh();
    };
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const interval = window.setInterval(check, 15_000);
    return () => {
      refreshRevision.current += 1;
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.clearInterval(interval);
    };
  }, [options.userId, options.hydrated, options.timerHydrated, refresh]);
  useEffect(() => {
    setReview(null);
    setMessage(null);
    setChoices({});
  }, [options.userId]);

  const begin = useCallback(
    async (selected?: RecoveryDraft) => {
      if (busy) return;
      const o = latest.current;
      setBusy(true);
      setMessage(null);
      try {
        await o.queueRef.current;
        await o.timerQueueRef.current;
        await protect();
        const draft = selected ?? capture();
        if (!draft || draft.userId !== o.userId) return;
        if (
          selected &&
          (!accountsEqual(o.snapshotRef.current, o.syncedRef.current) || capture()?.timerPending)
        )
          throw new Error(
            "Salve ou resolva as alterações desta aba antes de recuperar outro rascunho.",
          );
        const result = await o.dataSource.loadAccount(o.userId);
        if (o.scopeRef.current !== o.scope) return;
        if (!result.success) throw new Error(result.error);
        const timerResult = draft.timerPending
          ? await o.dataSource.getActiveTimer(o.userId, draft.workspaceId)
          : { success: true as const, data: initialTimer };
        if (o.scopeRef.current !== o.scope) return;
        if (!timerResult.success) throw new Error(timerResult.error);
        setReview({
          draft,
          remote: result.data,
          remoteTimer: timerResult.data ?? initialTimer,
          current: JSON.stringify(o.snapshotRef.current) + JSON.stringify(o.timerRef.current),
        });
        setChoices({});
        setKeepRemoteTimer(false);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Não foi possível recuperar as alterações.",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, capture, protect],
  );

  const apply = useCallback(async () => {
    if (!review || busy) return;
    const o = latest.current;
    if (review.draft.userId !== o.userId) return;
    setBusy(true);
    setMessage(null);
    try {
      await o.queueRef.current;
      await o.timerQueueRef.current;
      applying.current = true;
      await writeQueue.current;
      if (
        review.current !==
        JSON.stringify(o.snapshotRef.current) + JSON.stringify(o.timerRef.current)
      )
        throw new Error("Há novas alterações nesta aba. Feche e abra a revisão novamente.");
      const result = await o.dataSource.loadAccount(o.userId);
      if (o.scopeRef.current !== o.scope) return;
      if (!result.success) throw new Error(result.error);
      if (!accountsEqual(result.data, review.remote))
        throw new Error("Os dados do servidor mudaram. Feche e abra a revisão novamente.");
      const plan = planRecovery(review.draft, result.data, choices);
      if (!isValidAccount(plan.account))
        throw new Error(
          "As escolhas deixam registros inconsistentes. Revise os projetos, clientes e membros relacionados; o rascunho foi preservado.",
        );
      if (plan.conflicts.some((conflict) => !conflict.blocked && !choices[conflict.path]))
        throw new Error("Escolha a versão de cada informação em conflito.");
      let recoveredTimer: TimerState | null = null;
      let recoveredTimerBaseline: TimerState | null = null;
      if (review.draft.timerPending && review.draft.workspaceId === o.workspaceId) {
        const remoteTimer = await o.dataSource.getActiveTimer(o.userId, o.workspaceId);
        if (o.scopeRef.current !== o.scope) return;
        if (!remoteTimer.success) throw new Error(remoteTimer.error);
        recoveredTimerBaseline = remoteTimer.data ?? initialTimer;
        recoveredTimer = keepRemoteTimer ? recoveredTimerBaseline : review.draft.timer;
      }
      if (review.draft.timerPending && !keepRemoteTimer) {
        if (result.data.timerSyncProtocol !== 1)
          throw new Error(
            "O servidor precisa ser atualizado antes de recuperar cronômetros com segurança.",
          );
        if (review.draft.workspaceId !== o.workspaceId)
          throw new Error("Abra o workspace deste cronômetro antes de recuperá-lo.");
        if (!canRecoverTimer(review.draft, recoveredTimerBaseline ?? initialTimer))
          throw new Error(
            "O cronômetro mudou em outra sessão. Preserve o cronômetro do servidor e consulte a cópia do rascunho.",
          );
      }
      // Preserve BOTH original versions before applying explicit conflict choices.
      await writeRecoveryDraft({
        ...review.draft,
        id: `${o.userId}:archive:${crypto.randomUUID()}`,
        archived: true,
        serverAtRecovery: result.data,
      });
      if (o.scopeRef.current !== o.scope) return;
      if (
        review.current !==
        JSON.stringify(o.snapshotRef.current) + JSON.stringify(o.timerRef.current)
      )
        throw new Error("Há novas alterações nesta aba. Feche e abra a revisão novamente.");
      // Persist the resolved draft before replacing any in-memory version.
      const resolved = {
        ...review.draft,
        id: `${o.userId}:resolved:${crypto.randomUUID()}`,
        baseline: result.data,
        account: plan.account,
        archived: false,
        timer: recoveredTimer ?? o.timerRef.current,
        timerBaseline: recoveredTimerBaseline,
        timerPending: review.draft.timerPending && !keepRemoteTimer,
      };
      await writeRecoveryDraft(resolved);
      if (o.scopeRef.current !== o.scope) return;
      if (
        review.current !==
        JSON.stringify(o.snapshotRef.current) + JSON.stringify(o.timerRef.current)
      )
        throw new Error("Há novas alterações nesta aba. Feche e abra a revisão novamente.");
      o.syncedRef.current = result.data;
      o.snapshotRef.current = plan.account;
      o.onSaved(plan.account);
      if (recoveredTimer && recoveredTimerBaseline) {
        o.persistedTimerRef.current = {
          scope: o.scope,
          workspaceId: o.workspaceId,
          value: JSON.stringify(recoveredTimerBaseline),
        };
        o.onTimerRecovered(recoveredTimer);
      }
      if (!review.draft.id.startsWith(`${o.userId}:${pageId.current}:`))
        await archiveSourceIfUnchanged(review.draft);
      setReview(null);
      await refreshUnlocked();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível recuperar as alterações.",
      );
    } finally {
      applying.current = false;
      lastObserved.current = [];
      setBusy(false);
    }
  }, [review, busy, choices, keepRemoteTimer, refreshUnlocked]);

  const importDraft = useCallback(
    async (text: string) => {
      const userId = latest.current.userId;
      try {
        if (!userId) throw new Error("Entre na sua conta para importar um rascunho.");
        const draft = parseRecoveryDraft(text, userId);
        await writeRecoveryDraft(draft);
        if (latest.current.userId === userId) {
          await refresh();
          setMessage(null);
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Não foi possível importar o rascunho.",
        );
      }
    },
    [refresh],
  );

  return {
    protect,
    storageError,
    currentConflict,
    pendingDrafts: drafts.filter(
      (draft) =>
        draft.userId === options.userId && !draft.archived && verifiedPendingIds.includes(draft.id),
    ),
    drafts: drafts.filter((draft) => draft.userId === options.userId),
    busy,
    message,
    review: review?.draft.userId === options.userId ? review : null,
    choices,
    setChoices,
    keepRemoteTimer,
    setKeepRemoteTimer,
    begin,
    apply,
    close: () => {
      setReview(null);
      setMessage(null);
    },
    refresh,
    importDraft,
  };
}
export type RecoveryController = ReturnType<typeof useRecoveryJournal>;
