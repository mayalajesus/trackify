import { afterEach, describe, expect, it, vi } from "vitest";
import {
  elapsedForTimer,
  getDevicePreferences,
  isValidTimeZone,
  type UserPreferences,
} from "../../src/lib/store";
import {
  addSecondsToDateTime,
  dateTimeToTimestamp,
  getLocalToday,
  nowTime,
} from "../../src/lib/format";
import { createRunningTimer } from "../../src/lib/timer-start";

const storedPreferences: UserPreferences = {
  language: "pt-BR",
  theme: "system",
  avatarUrl: null,
  timezone: "UTC",
  activeWorkspaceId: "w1",
  reportFilters: {},
};

afterEach(() => vi.restoreAllMocks());

describe("timer persistence domain", () => {
  it("computes running elapsed seconds without changing the stored timer", () => {
    const timer = {
      status: "running" as const,
      workspaceId: "w1",
      task: "Design",
      projectId: "p1",
      billable: true,
      startedAt: 1_000,
      startedDate: "2026-08-28",
      accumulated: 12,
      startClock: "09:00",
    };
    expect(elapsedForTimer(timer, 3_501)).toBe(14);
    expect(timer.accumulated).toBe(12);
  });

  it("accepts IANA zones and rejects invalid zones", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("not/a-timezone")).toBe(false);
  });

  it.each([
    ["America/Sao_Paulo", "2026-09-04", "12:30", "13:00", "2026-09-04"],
    ["Asia/Kolkata", "2026-09-04", "21:00", "21:30", "2026-09-04"],
    ["Asia/Tokyo", "2026-09-05", "00:30", "01:00", "2026-09-05"],
    ["UTC", "2026-09-04", "15:30", "16:00", "2026-09-04"],
  ])(
    "uses the device clock in %s instead of the saved API timezone",
    (timeZone, expectedDate, expectedStart, expectedEnd, expectedEndDate) => {
      const options = new Intl.DateTimeFormat().resolvedOptions();
      vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
        ...options,
        timeZone,
      });
      const preferences = getDevicePreferences(storedPreferences);
      const startedAt = new Date("2026-09-04T15:30:00.000Z");
      const timer = createRunningTimer(
        { task: "Design", projectId: "p1", billable: true },
        {
          workspaceId: "w1",
          now: startedAt.getTime(),
          startedDate: getLocalToday(startedAt, preferences.timezone),
          startClock: nowTime(preferences.timezone, startedAt),
          hourlyRate: 0,
          currency: "BRL",
        },
      );
      const seconds = elapsedForTimer(timer, startedAt.getTime() + 30 * 60 * 1_000);
      const startTimestamp = dateTimeToTimestamp(
        timer.startedDate!,
        timer.startClock,
        0,
        preferences.timezone,
      );

      expect(preferences.timezone).toBe(timeZone);
      expect(timer.startedDate).toBe(expectedDate);
      expect(timer.startClock).toBe(expectedStart);
      expect(seconds).toBe(1_800);
      expect(startTimestamp).toBe(startedAt.getTime());
      expect(startTimestamp! + seconds * 1_000).toBe(
        new Date("2026-09-04T16:00:00.000Z").getTime(),
      );
      expect(addSecondsToDateTime(timer.startedDate!, timer.startClock, seconds)).toEqual({
        endDate: expectedEndDate,
        end: expectedEnd,
      });
    },
  );

  it("keeps the local date and clock when a timer crosses midnight", () => {
    const preferences = getDevicePreferences(storedPreferences, "America/Sao_Paulo");
    const now = new Date("2026-09-05T02:45:00.000Z");
    const date = getLocalToday(now, preferences.timezone);
    const start = nowTime(preferences.timezone, now);

    expect(date).toBe("2026-09-04");
    expect(start).toBe("23:45");
    expect(addSecondsToDateTime(date, start, 30 * 60)).toEqual({
      endDate: "2026-09-05",
      end: "00:15",
    });
  });

  it("preserves saved preferences and uses the current device after a refresh", () => {
    const snapshot = structuredClone(storedPreferences);
    const firstDevice = getDevicePreferences(storedPreferences, "America/Sao_Paulo");
    const anotherDevice = getDevicePreferences(firstDevice, "Asia/Kolkata");
    const reloaded = getDevicePreferences(snapshot, "America/Sao_Paulo");

    expect(anotherDevice).toEqual({ ...storedPreferences, timezone: "Asia/Kolkata" });
    expect(reloaded).toEqual(firstDevice);
    expect(storedPreferences).toEqual(snapshot);
    expect(getDevicePreferences(firstDevice, "America/Sao_Paulo")).toBe(firstDevice);
  });
});
