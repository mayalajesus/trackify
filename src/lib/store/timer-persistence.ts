import { accountsEqual } from "../../../shared/account-merge.mjs";
import type { TimerState } from "./types";

export type AccountScope = { userId: string; reloadKey: number };
export type PersistedTimer = {
  scope: AccountScope;
  workspaceId: string;
  value: string;
};

export const timerRecoveryConflict =
  "Another timer already exists on the server. Your local timer has been kept. Download your changes before resolving the conflict.";

export function resolveTimerHydration(
  local: TimerState,
  remote: TimerState,
  changedLocally: boolean,
): { success: true; timer: TimerState } | { success: false; error: string } {
  if (!changedLocally || local.status === "idle") return { success: true, timer: remote };
  if (remote.status !== "idle" && !accountsEqual(local, remote))
    return { success: false, error: timerRecoveryConflict };
  return { success: true, timer: local };
}

export function isTimerAcknowledged(
  timer: TimerState,
  persisted: PersistedTimer | null,
  scope: AccountScope,
  workspaceId: string,
) {
  return (
    persisted?.scope === scope &&
    persisted.workspaceId === workspaceId &&
    persisted.value === JSON.stringify(timer)
  );
}
