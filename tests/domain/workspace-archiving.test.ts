import { describe, expect, it, vi } from "vitest";
import { createWorkspaceActions } from "../../src/lib/store/workspace-actions";
import { initialTimer } from "../../src/lib/store/defaults";
import type { PersistedAccount } from "../../src/lib/account-types";

function setup(status: "running" | "paused" | "idle", timerWorkspace = "current", role = "Owner") {
  const target = {
    workspace: { id: "target", ownerId: "owner", name: "Target", status: "active" },
    memberships: [{ userId: "owner", role, status: "active" }],
    entries: [{ id: "historical-entry" }],
    projects: [{ id: "project" }],
    clients: [{ id: "client" }],
  };
  const current = { ...target, workspace: { ...target.workspace, id: "current" } };
  const account = { workspaces: [current, target] } as unknown as PersistedAccount;
  const timerRef = {
    current: { ...initialTimer, status, workspaceId: timerWorkspace, accumulated: 600 },
  };
  const setAccount = vi.fn();
  const setTimer = vi.fn();
  const actions = createWorkspaceActions({
    account,
    activeMemberId: "owner",
    activeWorkspaceId: "current",
    timerRef,
    setAccount,
    setTimer,
  } as unknown as Parameters<typeof createWorkspaceActions>[0]);
  return { actions, account, timerRef, setAccount, setTimer };
}

describe("archive workspace while tracking elsewhere", () => {
  it.each(["running", "paused", "idle"] as const)(
    "archives another workspace with a %s timer without touching history or timer",
    (status) => {
      const { actions, account, timerRef, setAccount, setTimer } = setup(status);
      const previousTimer = timerRef.current;
      expect(actions.archiveWorkspace("target")).toEqual({ success: true });
      const next = setAccount.mock.calls[0]![0](account) as PersistedAccount;
      expect(next.workspaces[1]!.workspace.status).toBe("archived");
      expect(next.workspaces[1]!.workspace.archivedAt).toBeTruthy();
      expect(next.workspaces[1]!.entries).toBe(account.workspaces[1]!.entries);
      expect(next.workspaces[0]).toBe(account.workspaces[0]);
      expect(timerRef.current).toBe(previousTimer);
      expect(setTimer).not.toHaveBeenCalled();
    },
  );
  it.each(["running", "paused"] as const)(
    "blocks archiving the timer's own workspace when %s",
    (status) => {
      const { actions, setAccount } = setup(status, "target");
      expect(actions.archiveWorkspace("target")).toEqual({
        success: false,
        error: "Stop the timer in this workspace before archiving it.",
      });
      expect(setAccount).not.toHaveBeenCalled();
    },
  );
  it.each(["Admin", "Member"])("preserves the owner restriction for %s", (role) => {
    const { actions, setAccount } = setup("idle", "current", role);
    expect(actions.archiveWorkspace("target").success).toBe(false);
    expect(setAccount).not.toHaveBeenCalled();
  });
});
