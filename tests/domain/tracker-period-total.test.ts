import { describe, expect, it } from "vitest";
import { trackerPeriodTotal } from "../../src/lib/tracker-period-total";
import { elapsedForTimer } from "../../src/lib/store/timer";
import type { TimerState } from "../../src/lib/store/types";

const period = { startDate: "2026-10-12", endDate: "2026-10-18" };
const timer: TimerState = {
  status: "running",
  workspaceId: "w1",
  task: "Tarefa",
  projectId: "p1",
  billable: false,
  startedAt: 1_000,
  startedDate: "2026-10-16",
  accumulated: 60,
  startClock: "09:00",
};
const total = (state = timer, elapsed = 90) =>
  trackerPeriodTotal(3600, state, elapsed, period, "w1", "2026-10-16");

describe("tracker period total with an active timer", () => {
  it("adds the live elapsed time and advances with the existing ticker", () => {
    expect(total(timer, elapsedForTimer(timer, 31_000))).toBe(3690);
    expect(total(timer, elapsedForTimer(timer, 32_000))).toBe(3691);
  });
  it("keeps accumulated time while paused", () => {
    const paused = { ...timer, status: "paused" as const, startedAt: null };
    expect(total(paused, elapsedForTimer(paused, 99_000))).toBe(3660);
  });
  it("does not double count elapsed time after stopping and saving", () => {
    expect(
      trackerPeriodTotal(3690, { ...timer, status: "idle" }, 90, period, "w1", "2026-10-16"),
    ).toBe(3690);
  });
  it("excludes another workspace", () => {
    expect(total({ ...timer, workspaceId: "w2" })).toBe(3600);
  });
  it.each(["2026-10-11", "2026-10-19"])("excludes dates outside the period: %s", (startedDate) => {
    expect(total({ ...timer, startedDate })).toBe(3600);
  });
  it.each([period.startDate, period.endDate])("includes the period boundary: %s", (startedDate) => {
    expect(total({ ...timer, startedDate })).toBe(3690);
  });
  it("uses the saved entry's start date for overnight tasks", () => {
    expect(
      trackerPeriodTotal(
        0,
        { ...timer, startedDate: "2026-10-18" },
        7200,
        period,
        "w1",
        "2026-10-19",
      ),
    ).toBe(7200);
  });
  it("falls back to today for a legacy timer without a date", () => {
    expect(total({ ...timer, startedDate: null })).toBe(3690);
  });
});
