import { describe, expect, it } from "vitest";
import {
  planRecovery,
  canRecoverTimer,
  parseRecoveryDraft,
  type RecoveryDraft,
} from "../../src/lib/store/recovery-journal";
import { makeSeedAccount } from "../../src/lib/store/seed-account";
import { initialTimer } from "../../src/lib/store/defaults";
import { assertTimerUnchanged } from "../../server/data/timer-conflict.mjs";

function draft(): RecoveryDraft {
  const baseline = makeSeedAccount();
  return {
    id: "user:tab:workspace",
    version: 1,
    userId: "user",
    updatedAt: new Date().toISOString(),
    baseline,
    account: structuredClone(baseline),
    workspaceId: baseline.workspaces[0]!.workspace.id,
    timer: initialTimer,
    timerBaseline: initialTimer,
    timerPending: false,
  };
}
describe("durable recovery planning", () => {
  it("rejects imports belonging to another user and discards untrusted timer acknowledgements", () => {
    const original = draft();
    expect(() => parseRecoveryDraft(JSON.stringify(original), "other-user")).toThrow();
    const imported = parseRecoveryDraft(JSON.stringify(original), original.userId);
    expect(imported.id).not.toBe(original.id);
    expect(imported.account).toEqual(original.account);
    expect(imported.timerBaseline).toBeNull();
  });
  it("combines independent changes without changing the original snapshots", () => {
    const local = draft();
    const remote = structuredClone(local.baseline);
    local.account.workspaces[0]!.workspace.name = "Local name";
    remote.workspaces[0]!.clients[0]!.name = "Remote client";
    const plan = planRecovery(local, remote);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.account.workspaces[0]!.workspace.name).toBe("Local name");
    expect(plan.account.workspaces[0]!.clients[0]!.name).toBe("Remote client");
    expect(remote.workspaces[0]!.workspace.name).not.toBe("Local name");
  });
  it("requires explicit field choices for conflicts while keeping both originals", () => {
    const local = draft();
    const remote = structuredClone(local.baseline);
    local.account.workspaces[0]!.workspace.name = "Local";
    remote.workspaces[0]!.workspace.name = "Remote";
    const plan = planRecovery(local, remote);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.account.workspaces[0]!.workspace.name).toBe("Remote");
    expect(
      planRecovery(local, remote, { [plan.conflicts[0]!.path]: "local" }).account.workspaces[0]!
        .workspace.name,
    ).toBe("Local");
    expect(local.account.workspaces[0]!.workspace.name).toBe("Local");
    expect(remote.workspaces[0]!.workspace.name).toBe("Remote");
  });
  it("never resurrects a workspace deleted remotely, even with a local choice", () => {
    const local = draft();
    local.account.workspaces[0]!.workspace.name = "Local";
    const remote = { ...structuredClone(local.baseline), workspaces: [] };
    const plan = planRecovery(local, remote);
    expect(plan.conflicts[0]!.blocked).toBe(true);
    expect(
      planRecovery(local, remote, { [plan.conflicts[0]!.path]: "local" }).account.workspaces,
    ).toEqual([]);
  });
  it("repeated recovery after a lost response does not duplicate records", () => {
    const local = draft();
    local.account.workspaces[0]!.clients.push({
      ...local.account.workspaces[0]!.clients[0]!,
      id: "new-client",
    });
    const saved = planRecovery(local, local.baseline).account;
    expect(planRecovery(local, saved).account).toEqual(saved);
  });
  it("does not recover an unknown or changed timer baseline over a remote timer", () => {
    const local = draft();
    local.timerPending = true;
    local.timer = { ...initialTimer, status: "running", task: "Local", startedAt: 1000 };
    expect(canRecoverTimer(local, initialTimer)).toBe(true);
    local.timerBaseline = null;
    expect(canRecoverTimer(local, initialTimer)).toBe(false);
    expect(canRecoverTimer(local, local.timer)).toBe(true);
    expect(canRecoverTimer(local, { ...local.timer, task: "Remote" })).toBe(false);
  });
  it("rejects stale timer writes and clears at the server precondition", () => {
    const timer = { ...initialTimer, status: "running", task: "Remote", startedAt: 1000 };
    expect(() => assertTimerUnchanged(initialTimer, timer)).toThrow();
    expect(() => assertTimerUnchanged(timer, null)).toThrow();
    expect(() => assertTimerUnchanged(initialTimer, null)).not.toThrow();
    expect(() => assertTimerUnchanged(timer, structuredClone(timer))).not.toThrow();
  });
});
