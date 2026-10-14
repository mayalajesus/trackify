import { describe, expect, it, vi } from "vitest";
import { handleTaskAction } from "../../server/task-actions.mjs";

describe("collaboration invitation timing", () => {
  it.each(["running", "paused", "missing", "finished", "busy", "declined"])(
    "handles %s without starting a separate clock at acceptance time",
    async (scenario) => {
      const source = {
        task: "Current task",
        project_id: "project",
        task_details: { id: "task-id", urgent: false },
        status: scenario === "paused" ? "paused" : "running",
        started_at: scenario === "paused" ? null : "2026-10-13T10:00:00.000Z",
        started_date: "2026-10-13",
        accumulated_seconds: 421,
        start_clock: "06:30:12",
      };
      const query = vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("select * from public.task_invitations"))
          return {
            rowCount: 1,
            rows: [{ id: "invite", invited_by: "creator", task_id: "task-id", task: "Old task" }],
          };
        if (sql.includes("select * from public.active_timers")) {
          expect(values).toEqual(["workspace", "creator", "task-id"]);
          expect(sql).toContain("for update");
          return {
            rowCount: ["missing", "finished"].includes(scenario) ? 0 : 1,
            rows: ["missing", "finished"].includes(scenario) ? [] : [source],
          };
        }
        if (sql.includes("insert into public.time_entries")) {
          expect(values).toEqual(["workspace", "creator", "recipient", "task-id"]);
          expect(sql).toContain("e.workspace_id=$1 and e.user_id=$2 and e.task_details->>'id'=$4");
          expect(sql).toContain("e.start_at,e.end_at,e.duration_seconds");
          return {
            rowCount: scenario === "finished" ? 1 : 0,
            rows:
              scenario === "finished"
                ? [
                    {
                      id: "copied-entry",
                      date: "2026-10-13",
                      end_date: "2026-10-13",
                      start_time: "10:00:01",
                      end_time: "10:05:02",
                      duration_seconds: 301,
                      start_at: "2026-10-13T10:00:01Z",
                      end_at: "2026-10-13T10:05:02Z",
                      user_id: "recipient",
                      task: source.task,
                      project_id: "project",
                      billable: false,
                      hourly_rate: 25,
                      currency: "BRL",
                      task_details: source.task_details,
                    },
                  ]
                : [],
          };
        }
        if (sql.includes("select p.id")) return { rowCount: 1, rows: [{ id: "project" }] };
        if (sql.includes("insert into public.active_timers")) {
          expect(values).toEqual([
            "recipient",
            "workspace",
            source.task,
            source.project_id,
            source.task_details,
            source.status,
            source.started_at,
            source.started_date,
            421,
            "06:30:12",
          ]);
          expect(sql).toContain("on conflict (user_id, workspace_id) do nothing");
          expect(sql).not.toContain("now()");
          return {
            rowCount: scenario === "busy" ? 0 : 1,
            rows: scenario === "busy" ? [] : [source],
          };
        }
        return { rows: [], rowCount: 0 };
      });
      const result = handleTaskAction(
        { query },
        { id: "recipient" },
        {
          operation: "respondTaskInvitation",
          workspaceId: "workspace",
          invitationId: "invite",
          response: scenario === "declined" ? "declined" : "accepted",
        },
        {
          uuid: String,
          requireWorkspaceAccess: vi.fn().mockResolvedValue({}),
          timerFromRow: (row) => row,
        },
      );
      if (scenario === "missing" || scenario === "busy") {
        await expect(result).rejects.toMatchObject({ status: 409 });
        expect(query).toHaveBeenCalledWith("rollback");
        expect(
          query.mock.calls.some(([sql]) => sql.startsWith("update public.task_invitations")),
        ).toBe(false);
      } else {
        await expect(result).resolves.toMatchObject({
          timer: ["declined", "finished"].includes(scenario) ? null : source,
          ...(scenario === "finished"
            ? {
                entries: [
                  expect.objectContaining({
                    id: "copied-entry",
                    userId: "recipient",
                    seconds: 301,
                    startTimestamp: Date.parse("2026-10-13T10:00:01Z"),
                    endTimestamp: Date.parse("2026-10-13T10:05:02Z"),
                  }),
                ],
              }
            : {}),
        });
        expect(query).toHaveBeenCalledWith("commit");
      }
      if (["missing", "declined", "finished"].includes(scenario))
        expect(
          query.mock.calls.some(([sql]) => sql.includes("insert into public.active_timers")),
        ).toBe(false);
    },
  );
});
