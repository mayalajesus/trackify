import { accountsEqual } from "../../../shared/account-merge.mjs";
import type { AccountDataSource } from "../account-data-source";
import type { PersistedAccount } from "../account-types";
import { initialTimer } from "./defaults";
import { canRecoverTimer, planRecovery, type RecoveryDraft } from "./recovery-journal";
import { isValidAccount } from "./validation";
import type { TimerState } from "./types";

type Source = Pick<
  AccountDataSource,
  "loadAccount" | "syncAccount" | "getActiveTimer" | "saveActiveTimer" | "clearActiveTimer"
>;
export type AutomaticRecoveryResult =
  | { status: "saved"; account: PersistedAccount; timer: TimerState }
  | { status: "conflict" | "retry" };

// No local record is deleted here. The caller archives the unchanged source only
// after every write is acknowledged. Lost responses can safely retry the same IDs.
export async function recoverAutomatically(
  draft: RecoveryDraft,
  source: Source,
  isCurrent: () => boolean,
): Promise<AutomaticRecoveryResult> {
  try {
    if (!isCurrent()) return { status: "retry" };
    const loaded = await source.loadAccount(draft.userId);
    if (!isCurrent() || !loaded.success) return { status: "retry" };
    const plan = planRecovery(draft, loaded.data);
    if (plan.conflicts.length || !isValidAccount(plan.account)) return { status: "conflict" };
    const timerResult = draft.timerPending
      ? await source.getActiveTimer(draft.userId, draft.workspaceId)
      : { success: true as const, data: initialTimer };
    if (!isCurrent() || !timerResult.success) return { status: "retry" };
    let timer = timerResult.data ?? initialTimer;
    if (!canRecoverTimer(draft, timer)) return { status: "conflict" };
    const timerChanged = draft.timerPending && !accountsEqual(draft.timer, timer);
    if (timerChanged && loaded.data.timerSyncProtocol !== 1) return { status: "retry" };
    let account = loaded.data;
    if (!accountsEqual(plan.account, account)) {
      // Preserve the original baseline: the server performs another atomic merge
      // and can reject a conflict that appeared after our read.
      const saved = await source.syncAccount(draft.userId, draft.account, draft.baseline);
      if (!isCurrent() || !saved.success || !saved.data?.workspaces) return { status: "retry" };
      account = saved.data;
    }
    if (timerChanged) {
      if (!isCurrent()) return { status: "retry" };
      const saved =
        draft.timer.status === "idle"
          ? await source.clearActiveTimer(draft.userId, draft.workspaceId, timer)
          : await source.saveActiveTimer(draft.userId, draft.timer, timer);
      if (!isCurrent() || !saved.success) return { status: "retry" };
      timer = saved.data ?? initialTimer;
    }
    return { status: "saved", account, timer };
  } catch {
    return { status: "retry" };
  }
}
