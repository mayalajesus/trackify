import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimerActions } from "../../src/lib/store/timer-actions";
import { createEntryActions } from "../../src/lib/store/entry-actions";
import { timeEntriesOverlap } from "../../src/lib/time-entry-overlap";
import type { TimeEntry } from "../../src/lib/domain";

const entry: TimeEntry = {
  id: "a",
  date: "2026-10-13",
  start: "10:00",
  end: "10:00",
  seconds: 20,
  startTimestamp: Date.parse("2026-10-13T10:00:10Z"),
  endTimestamp: Date.parse("2026-10-13T10:00:30Z"),
  userId: "u1",
  projectId: "p1",
  task: "Task",
  billable: false,
};
afterEach(() => vi.restoreAllMocks());

describe("overlap warnings only when editing time", () => {
  it("saves consecutive timers in the same minute with exact seconds and no warning", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-13T10:00:50Z"));
    let saved: TimeEntry[] = [entry];
    const actions = createTimerActions({
      timerRef: {
        current: {
          status: "running",
          workspaceId: "w1",
          task: "Next",
          projectId: "p1",
          startedAt: entry.endTimestamp,
          accumulated: 0,
          startedDate: entry.date,
          startClock: "10:00",
        },
      },
      activeWorkspaceId: "w1",
      activeMemberId: "u1",
      preferences: { timezone: "UTC" },
      workspaceBilling: { hourlyRate: 0, currency: "BRL" },
      billableForProject: () => false,
      validateProjectId: () => ({ success: true }),
      timerRevisionRef: { current: 0 },
      setTimer: vi.fn(),
      setElapsed: vi.fn(),
      setEntries: (update: (list: TimeEntry[]) => TimeEntry[]) => {
        saved = update(saved);
      },
    } as unknown as Parameters<typeof createTimerActions>[0]);
    expect(actions.stopTimer()).toEqual({ success: true });
    expect(saved[0]).toMatchObject({
      startTimestamp: entry.endTimestamp,
      endTimestamp: Date.now(),
      seconds: 20,
    });
    expect(
      timeEntriesOverlap({ ...entry, workspaceId: "w1" }, { ...saved[0]!, workspaceId: "w1" }),
    ).toBe(false);
    expect(
      timeEntriesOverlap(
        { ...entry, workspaceId: "w1" },
        { ...saved[0]!, workspaceId: "w1", startTimestamp: entry.endTimestamp! - 1000 },
      ),
    ).toBe(true);
  });

  it("checks conflicts only for changed time values, not task edits, creation or restoration", () => {
    const findEntryConflict = vi.fn(() => ({ ...entry, id: "conflict" }));
    const options = {
      can: () => true,
      activeMemberId: "u1",
      timerRef: { current: { status: "idle" } },
      billableForProject: () => false,
      workspaceBilling: { hourlyRate: 0, currency: "BRL" },
      currencyForProject: () => "BRL",
      validateEntry: () => ({ success: true }),
      findEntryConflict,
      setEntries: vi.fn(),
      entries: [entry],
      preferences: { timezone: "UTC" },
    } as unknown as Parameters<typeof createEntryActions>[0];
    const actions = createEntryActions(options);
    expect(actions.addEntry(entry)).toEqual({ success: true });
    expect(actions.restoreEntry({ ...entry, id: "restored" })).toEqual({ success: true });
    expect(actions.updateEntry(entry.id, { ...entry, task: "Renamed" })).toEqual({ success: true });
    expect(findEntryConflict).not.toHaveBeenCalled();
    expect(actions.updateEntry(entry.id, { seconds: 40 })).toMatchObject({
      success: true,
      conflict: { id: "conflict" },
    });
    expect(findEntryConflict).toHaveBeenCalledOnce();
  });
});
