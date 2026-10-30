import { afterEach, expect, it, vi } from "vitest";
import { createTimerActions } from "../../src/lib/store/timer-actions";
import { initialTimer } from "../../src/lib/store/defaults";
import type { TimeEntry } from "../../src/lib/domain";
vi.mock("../../src/lib/api-data-source", () => ({ request: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it("starts empty, preserves elapsed time on incomplete stop and saves only after completion", () => {
  let now = Date.parse("2026-10-30T09:00:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const timerRef = { current: { ...initialTimer } };
  let entries: TimeEntry[] = [];
  const scope = { userId: "owner", reloadKey: 0 };
  const actions = createTimerActions({
    timerRef,
    accountScope: scope,
    workspaceCreationRef: { current: null },
    acceptingTaskRef: { current: false },
    can: () => true,
    activeWorkspaceId: "workspace",
    activeMemberId: "owner",
    preferences: { timezone: "UTC" },
    workspaceBilling: { hourlyRate: 0, currency: "BRL" },
    validateProjectId: (id: string | null) =>
      id === "forbidden" ? { success: false, error: "Forbidden project" } : { success: true },
    billableForProject: (id: string | null) => id === "project",
    currencyForProject: () => "BRL",
    timerRevisionRef: { current: 0 },
    setTimer: vi.fn(),
    setElapsed: vi.fn(),
    setEntries: (update: (list: TimeEntry[]) => TimeEntry[]) => {
      entries = update(entries);
    },
  } as unknown as Parameters<typeof createTimerActions>[0]);
  expect(actions.startTimer("", "forbidden").success).toBe(false);
  expect(actions.startTimer("", null).success).toBe(true);
  expect(actions.startTimer("", null).success).toBe(false);
  now += 60_000;
  expect(actions.stopTimer().success).toBe(false);
  expect(timerRef.current).toMatchObject({
    status: "paused",
    task: "",
    projectId: null,
    accumulated: 60,
  });
  expect(entries).toHaveLength(0);
  now += 120_000;
  expect(actions.resumeTimer().success).toBe(true);
  now += 30_000;
  expect(actions.stopTimer().success).toBe(false);
  expect(timerRef.current.accumulated).toBe(90);
  expect(actions.updateTimer({ task: "Atendimento" }).success).toBe(true);
  expect(actions.stopTimer().success).toBe(false);
  expect(entries).toHaveLength(0);
  expect(actions.updateTimer({ projectId: "project" }).success).toBe(true);
  now += 120_000;
  expect(actions.stopTimer().success).toBe(true);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    task: "Atendimento",
    projectId: "project",
    seconds: 90,
    billable: true,
  });
  expect(actions.stopTimer().success).toBe(false);
  expect(entries).toHaveLength(1);
});
