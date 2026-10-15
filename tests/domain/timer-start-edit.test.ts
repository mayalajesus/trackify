import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimerActions } from "../../src/lib/store/timer-actions";
import { initialTimer } from "../../src/lib/store/defaults";
import type { TimerState } from "../../src/lib/store/types";
vi.mock("../../src/lib/api-data-source", () => ({ request: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function setup(status: "running" | "paused" = "running", owner?: string) {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-13T12:00:00Z"));
  const timerRef = {
    current: {
      ...initialTimer,
      status,
      startedDate: "2026-10-13",
      startClock: "11:00",
      startedAt: status === "running" ? Date.parse("2026-10-13T11:00:00Z") : null,
      accumulated: status === "paused" ? 1800 : 0,
      collaborationOwnerId: owner,
    } as TimerState,
  };
  const setTimer = vi.fn();
  const actions = createTimerActions({
    timerRef,
    can: () => true,
    activeMemberId: "owner",
    preferences: { timezone: "UTC" },
    timerRevisionRef: { current: 0 },
    setTimer,
    setElapsed: vi.fn(),
  } as unknown as Parameters<typeof createTimerActions>[0]);
  return { actions, timerRef, setTimer };
}
describe("editing the active timer start", () => {
  it("moves the start and adjusts elapsed time", () => {
    const { actions, timerRef } = setup();
    expect(actions.setTimerStart("2026-10-13", "10:30").success).toBe(true);
    expect(timerRef.current).toMatchObject({
      startClock: "10:30",
      accumulated: 5400,
      status: "running",
    });
  });
  it("keeps paused time excluded and stays paused", () => {
    const { actions, timerRef } = setup("paused");
    expect(actions.setTimerStart("2026-10-13", "10:30").success).toBe(true);
    expect(timerRef.current).toMatchObject({
      accumulated: 3600,
      status: "paused",
      startedAt: null,
    });
  });
  it.each([
    ["2026-10-13", "12:30"],
    ["", "11:00"],
    ["2026-10-13", "invalid"],
  ])("rejects invalid or future start %s %s", (date, clock) => {
    const { actions, setTimer } = setup();
    expect(actions.setTimerStart(date!, clock!).success).toBe(false);
    expect(setTimer).not.toHaveBeenCalled();
  });
  it("prevents a participant from changing the creator's start", () => {
    const { actions, setTimer } = setup("running", "another-owner");
    expect(actions.setTimerStart("2026-10-13", "10:30").success).toBe(false);
    expect(setTimer).not.toHaveBeenCalled();
  });
});

describe("shared timer pause control", () => {
  it("does not pause a participant timer or change its elapsed time", () => {
    const { actions, timerRef, setTimer } = setup("running", "another-owner");
    const before = timerRef.current;
    actions.pauseTimer();
    expect(timerRef.current).toBe(before);
    expect(setTimer).not.toHaveBeenCalled();
  });
  it("does not resume a participant timer paused by the creator", () => {
    const { actions, timerRef, setTimer } = setup("paused", "another-owner");
    const before = timerRef.current;
    expect(actions.resumeTimer().success).toBe(false);
    expect(timerRef.current).toBe(before);
    expect(setTimer).not.toHaveBeenCalled();
  });
  it.each([undefined, "owner"])("allows the timer owner to pause (%s)", (owner) => {
    const { actions, timerRef, setTimer } = setup("running", owner);
    actions.pauseTimer();
    expect(timerRef.current.status).toBe("paused");
    expect(setTimer).toHaveBeenCalledOnce();
  });
});
