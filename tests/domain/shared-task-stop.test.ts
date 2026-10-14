import { describe, expect, it, vi } from "vitest";
import {
  clearOwnTimer,
  timerWithOwner,
  requireSharedTimerSource,
} from "../../server/data/timer.mjs";
import { createTimerActions } from "../../src/lib/store/timer-actions";

describe("shared task stop permissions", () => {
  it.each([true, false])(
    "commits participant stop only when their hours were saved: %s",
    async (saved) => {
      const query = vi.fn(async (sql: string) => {
        if (sql.startsWith("select * from public.active_timers"))
          return {
            rows: [
              {
                task_details: { id: "task" },
                start_clock: "09:00",
                updated_at: "2026-10-13T12:00:00Z",
              },
            ],
            rowCount: 1,
          };
        if (sql.includes("insert into public.time_entries"))
          return { rows: [], rowCount: saved ? 2 : 0 };
        if (sql.includes("delete from public.active_timers t")) return { rows: [], rowCount: 2 };
        return { rows: [], rowCount: 0 };
      });
      const result = clearOwnTimer({ query }, "creator", "workspace");
      if (saved) {
        await result;
        expect(query).toHaveBeenCalledWith("commit");
      } else {
        await expect(result).rejects.toMatchObject({ status: 409 });
        expect(query).toHaveBeenCalledWith("rollback");
        expect(query).not.toHaveBeenCalledWith("commit");
      }
    },
  );

  it("rejects a late participant save after the source timer has ended", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("select invited_by") ? [{ invited_by: "creator" }] : [],
    }));
    await expect(
      requireSharedTimerSource({ query }, "participant", "workspace", "task"),
    ).rejects.toMatchObject({ status: 409 });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("for share"), [
      "workspace",
      "creator",
      "task",
    ]);
  });
  it.each(["creator", "participant", "personal", "missing"])(
    "handles %s using server-side ownership",
    async (scenario) => {
      const row = {
        status: "running",
        workspace_id: "workspace",
        task: "Task",
        task_details: { id: "task" },
        started_at: "2026-10-13T12:00:00Z",
        start_clock: "09:00:00",
        accumulated_seconds: 0,
      };
      const query = vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.startsWith("select * from public.active_timers")) {
          expect(values).toEqual(["user", "workspace"]);
          return { rows: scenario === "missing" ? [] : [row] };
        }
        if (sql.includes("select invited_by")) {
          expect(values).toEqual(["workspace", "task", "user"]);
          expect(sql).toContain("status='accepted'");
          return { rows: scenario === "participant" ? [{ invited_by: "creator" }] : [] };
        }
        return { rows: [] };
      });
      if (scenario === "participant") {
        expect(await timerWithOwner({ query }, "user", "workspace", row)).toMatchObject({
          collaborationOwnerId: "creator",
        });
        await expect(clearOwnTimer({ query }, "user", "workspace")).rejects.toMatchObject({
          status: 403,
        });
        expect(query).toHaveBeenCalledWith("rollback");
        expect(query.mock.calls.some(([sql]) => sql.startsWith("delete"))).toBe(false);
      } else {
        await clearOwnTimer({ query }, "user", "workspace");
        expect(query).toHaveBeenCalledWith("commit");
        expect(query.mock.calls.some(([sql]) => sql.startsWith("delete"))).toBe(
          scenario !== "missing",
        );
      }
    },
  );

  it("blocks local stop before adding hours or clearing the participant timer", () => {
    const timer = { status: "running", collaborationOwnerId: "creator" };
    const setEntries = vi.fn(),
      setTimer = vi.fn();
    const actions = createTimerActions({
      timerRef: { current: timer },
      activeMemberId: "participant",
      setEntries,
      setTimer,
    } as unknown as Parameters<typeof createTimerActions>[0]);
    expect(actions.stopTimer()).toEqual({
      success: false,
      error: "Only the person who started this shared task can stop it.",
    });
    expect(setEntries).not.toHaveBeenCalled();
    expect(setTimer).not.toHaveBeenCalled();
  });
});
