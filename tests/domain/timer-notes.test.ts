import { describe, expect, it, vi } from "vitest";
import { taskDetailsValue } from "../../server/task-actions.mjs";
import { createTimerActions } from "../../src/lib/store/timer-actions";
import { initialTimer } from "../../src/lib/store/defaults";
import type { TimeEntry } from "../../src/lib/domain";
vi.mock("../../src/lib/api-data-source", () => ({ request: vi.fn() }));
const details = {
  id: "11111111-1111-4111-8111-111111111111",
  urgent: false,
  description: "Linha 1\nLinha 2",
};
describe("notes while tracking", () => {
  it("preserves the note through server validation, including clearing it", () => {
    expect(taskDetailsValue(details)).toEqual(details);
    expect(taskDetailsValue({ ...details, description: "" })?.description).toBe("");
  });
  it("rejects invalid or oversized notes", () => {
    expect(() => taskDetailsValue({ ...details, description: 42 })).toThrow();
    expect(() => taskDetailsValue({ ...details, description: "a".repeat(10001) })).toThrow();
  });
  it("includes the active note in the finished entry", () => {
    const setEntries = vi.fn();
    const actions = createTimerActions({
      timerRef: {
        current: {
          ...initialTimer,
          status: "paused",
          workspaceId: "workspace",
          task: "Task",
          projectId: "project",
          startedDate: "2026-10-13",
          startClock: "09:00",
          accumulated: 120,
          taskDetails: details,
        },
      },
      activeWorkspaceId: "workspace",
      activeMemberId: "owner",
      preferences: { timezone: "UTC" },
      validateProjectId: () => ({ success: true }),
      billableForProject: () => false,
      workspaceBilling: { hourlyRate: 0, currency: "BRL" },
      setEntries,
      timerRevisionRef: { current: 0 },
      setTimer: vi.fn(),
      setElapsed: vi.fn(),
    } as unknown as Parameters<typeof createTimerActions>[0]);
    expect(actions.stopTimer().success).toBe(true);
    const update = setEntries.mock.calls[0]![0] as (entries: TimeEntry[]) => TimeEntry[];
    expect(update([])[0]).toMatchObject({ description: details.description, seconds: 120 });
  });
});
