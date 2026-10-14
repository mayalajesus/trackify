import { describe, expect, it, vi } from "vitest";
import { request } from "../../src/lib/api-data-source";
import { createTimerActions } from "../../src/lib/store/timer-actions";
import { initialTimer } from "../../src/lib/store/defaults";
import type { TimeEntry } from "../../src/lib/domain";

vi.mock("../../src/lib/api-data-source", () => ({ request: vi.fn() }));

describe("accepting a finished collaboration", () => {
  it.each(["idle", "running", "paused"] as const)(
    "preserves the current %s timer and adds the saved entry",
    async (status) => {
      const scope = { userId: "recipient", reloadKey: 0 };
      const timer = { ...initialTimer, status, task: "Other task", workspaceId: "workspace" };
      const entry = { id: "finished-entry", task: "Shared task", seconds: 301 } as TimeEntry;
      const setEntries = vi.fn();
      const setTimer = vi.fn();
      const setElapsed = vi.fn();
      const timerRef = { current: timer };
      const acceptingTaskRef = { current: false };
      const dependencies = {
        acceptingTaskRef,
        timerRef,
        timerSyncPromiseRef: { current: null },
        accountScopeRef: { current: scope },
        accountScope: scope,
        timerWorkspaceRef: { current: "workspace" },
        activeWorkspaceId: "workspace",
        setEntries,
        setTimer,
        setElapsed,
      } as unknown as Parameters<typeof createTimerActions>[0];
      vi.mocked(request).mockResolvedValue({
        success: true,
        data: { timer: null, entries: [entry] },
      });
      await expect(
        createTimerActions(dependencies).acceptTaskInvitation("invitation"),
      ).resolves.toEqual({ success: true });
      expect(timerRef.current).toBe(timer);
      expect(setTimer).not.toHaveBeenCalled();
      expect(setElapsed).not.toHaveBeenCalled();
      const update = setEntries.mock.calls[0]![0] as (entries: TimeEntry[]) => TimeEntry[];
      const other = { id: "other-entry" } as TimeEntry;
      expect(update([other, entry])).toEqual([other, entry]);
      expect(acceptingTaskRef.current).toBe(false);
    },
  );
});
