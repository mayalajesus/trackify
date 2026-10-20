import { describe, expect, it } from "vitest";
import { initialTimer } from "../../src/lib/store/defaults";
import {
  isTimerAcknowledged,
  resolveTimerHydration,
  timerRecoveryConflict,
} from "../../src/lib/store/timer-persistence";
import type { TimerState } from "../../src/lib/store/types";

const local: TimerState = {
  ...initialTimer,
  status: "running",
  task: "Pending local timer",
  projectId: "project",
  workspaceId: "workspace",
  startedAt: 1000,
};

describe("timer persistence recovery", () => {
  it("keeps a timer started before a retry when the server has no timer", () => {
    expect(resolveTimerHydration(local, initialTimer, true)).toEqual({
      success: true,
      timer: local,
    });
  });

  it("loads the server timer when there are no local changes", () => {
    expect(resolveTimerHydration(initialTimer, local, false)).toEqual({
      success: true,
      timer: local,
    });
  });

  it("does not overwrite either timer when a pending draft conflicts with the server", () => {
    const remote = { ...local, task: "Different remote timer" };
    expect(resolveTimerHydration(local, remote, true)).toEqual({
      success: false,
      error: timerRecoveryConflict,
    });
    expect(local.task).toBe("Pending local timer");
    expect(remote.task).toBe("Different remote timer");
  });

  it("accepts an already acknowledged identical timer", () => {
    expect(resolveTimerHydration(local, structuredClone(local), true)).toEqual({
      success: true,
      timer: local,
    });
  });

  it("restores the remote timer after the local draft was completed", () => {
    expect(resolveTimerHydration(initialTimer, local, true)).toEqual({
      success: true,
      timer: local,
    });
  });

  it("only permits polling a timer acknowledged in the same account and workspace", () => {
    const scope = { userId: "user", reloadKey: 0 };
    const persisted = { scope, workspaceId: "workspace", value: JSON.stringify(local) };
    expect(isTimerAcknowledged(local, persisted, scope, "workspace")).toBe(true);
    expect(isTimerAcknowledged({ ...local, status: "paused" }, persisted, scope, "workspace")).toBe(
      false,
    );
    expect(isTimerAcknowledged(local, null, scope, "workspace")).toBe(false);
    expect(isTimerAcknowledged(local, persisted, { ...scope }, "workspace")).toBe(false);
    expect(isTimerAcknowledged(local, persisted, scope, "another-workspace")).toBe(false);
  });
});
