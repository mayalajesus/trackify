import { describe, expect, it, vi } from "vitest";
import { recoverAutomatically } from "../../src/lib/store/automatic-recovery";
import { makeSeedAccount } from "../../src/lib/store/seed-account";
import { initialTimer } from "../../src/lib/store/defaults";
import type { RecoveryDraft } from "../../src/lib/store/recovery-journal";
import type { TimerState } from "../../src/lib/store/types";
import { mergeAccountChanges } from "../../shared/account-merge.mjs";
import { assertTimerUnchanged } from "../../server/data/timer-conflict.mjs";
import type { AccountDataSource } from "../../src/lib/account-data-source";
import type { PersistedAccount } from "../../src/lib/account-types";

function setup() {
  const baseline = makeSeedAccount();
  const draft: RecoveryDraft = {
    id: "draft",
    version: 1,
    userId: "user",
    updatedAt: "2026-10-22T12:00:00Z",
    workspaceId: baseline.workspaces[0]!.workspace.id,
    baseline,
    account: structuredClone(baseline),
    timer: initialTimer,
    timerBaseline: initialTimer,
    timerPending: false,
  };
  draft.account.workspaces[0]!.clients[0]!.name = "Offline edit";
  let remote: PersistedAccount = { ...structuredClone(baseline), timerSyncProtocol: 1 };
  let timer: TimerState | null = null;
  const source = {
    loadAccount: vi.fn<AccountDataSource["loadAccount"]>(async () => ({
      success: true,
      data: structuredClone(remote),
    })),
    syncAccount: vi.fn<AccountDataSource["syncAccount"]>(async (_user, account, base) => {
      remote = mergeAccountChanges(base, account, remote);
      return { success: true, data: structuredClone(remote) };
    }),
    getActiveTimer: vi.fn<AccountDataSource["getActiveTimer"]>(async () => ({
      success: true,
      data: timer,
    })),
    saveActiveTimer: vi.fn<AccountDataSource["saveActiveTimer"]>(async (_user, next, expected) => {
      try {
        assertTimerUnchanged(expected, timer, next);
      } catch {
        return { success: false, error: "Timer conflict" };
      }
      timer = next;
      return { success: true, data: next };
    }),
    clearActiveTimer: vi.fn<AccountDataSource["clearActiveTimer"]>(
      async (_user, _workspace, expected) => {
        try {
          assertTimerUnchanged(expected, timer, null);
        } catch {
          return { success: false, error: "Timer conflict" };
        }
        timer = null;
        return { success: true, data: null };
      },
    ),
  };
  return {
    draft,
    source,
    remote: () => remote,
    timer: () => timer,
    setTimer: (next: TimerState) => {
      timer = next;
    },
  };
}

describe("automatic durable recovery", () => {
  it("merges compatible offline edits and keeps unrelated server changes", async () => {
    const f = setup();
    f.remote().workspaces[0]!.workspace.name = "Remote workspace";
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("saved");
    expect(f.remote().workspaces[0]!.clients[0]!.name).toBe("Offline edit");
    expect(f.remote().workspaces[0]!.workspace.name).toBe("Remote workspace");
    expect(f.draft.baseline.workspaces[0]!.clients[0]!.name).not.toBe("Offline edit");
  });
  it("requests review for conflicting fields without writing either version", async () => {
    const f = setup();
    f.remote().workspaces[0]!.clients[0]!.name = "Other session";
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("conflict");
    expect(f.source.syncAccount).not.toHaveBeenCalled();
    expect(f.remote().workspaces[0]!.clients[0]!.name).toBe("Other session");
  });
  it("retries a partially saved stop without duplicating entries or losing its timer baseline", async () => {
    const f = setup();
    const running: TimerState = {
      ...initialTimer,
      status: "running",
      task: "Offline task",
      startedAt: 1000,
    };
    f.setTimer(running);
    f.draft.timerPending = true;
    f.draft.timerBaseline = running;
    f.draft.account.workspaces[0]!.clients.push({
      ...f.draft.account.workspaces[0]!.clients[0]!,
      id: "new-client",
    });
    f.source.clearActiveTimer.mockResolvedValueOnce({ success: false, error: "Offline" });
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("retry");
    expect(f.timer()).toEqual(running);
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("saved");
    expect(f.timer()).toBeNull();
    expect(
      f.remote().workspaces[0]!.clients.filter((client) => client.id === "new-client"),
    ).toHaveLength(1);
    expect(f.source.syncAccount).toHaveBeenCalledTimes(1);
  });
  it("rejects a timer changed between read and write, then asks for review", async () => {
    const f = setup();
    f.draft.timerPending = true;
    f.draft.timer = { ...initialTimer, status: "running", task: "Local timer", startedAt: 1000 };
    f.source.syncAccount.mockImplementationOnce(async (_user, account, base) => {
      f.setTimer({ ...f.draft.timer, task: "Other timer", startedAt: 2000 });
      return { success: true, data: mergeAccountChanges(base, account, f.remote()) };
    });
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("retry");
    expect(f.timer()?.task).toBe("Other timer");
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("conflict");
  });
  it("handles a lost stop response as an idempotent acknowledgement on retry", async () => {
    const f = setup();
    const running: TimerState = {
      ...initialTimer,
      status: "running",
      task: "Task",
      startedAt: 1000,
    };
    f.setTimer(running);
    f.draft.timerPending = true;
    f.draft.timerBaseline = running;
    const clear = f.source.clearActiveTimer.getMockImplementation()!;
    f.source.clearActiveTimer.mockImplementationOnce(async (...args) => {
      await clear(...args);
      return { success: false, error: "Response lost" };
    });
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("retry");
    expect(f.timer()).toBeNull();
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("saved");
    expect(f.source.clearActiveTimer).toHaveBeenCalledTimes(1);
  });
  it("does not write after the user/scope changes during a request", async () => {
    const f = setup();
    let current = true;
    f.source.loadAccount.mockImplementationOnce(async () => {
      current = false;
      return { success: true, data: f.remote() };
    });
    expect((await recoverAutomatically(f.draft, f.source, () => current)).status).toBe("retry");
    expect(f.source.syncAccount).not.toHaveBeenCalled();
  });
  it("treats a failed read as retryable, not as a conflict or acknowledgement", async () => {
    const f = setup();
    f.source.loadAccount.mockResolvedValueOnce({ success: false, error: "Offline" });
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("retry");
    expect(f.source.syncAccount).not.toHaveBeenCalled();
  });
  it("never restores revoked workspace access automatically", async () => {
    const f = setup();
    f.remote().workspaces = [];
    expect((await recoverAutomatically(f.draft, f.source, () => true)).status).toBe("conflict");
    expect(f.source.syncAccount).not.toHaveBeenCalled();
  });
});
