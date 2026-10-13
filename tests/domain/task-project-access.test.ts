import { describe, expect, it, vi } from "vitest";
import { handleTaskAction } from "../../server/task-actions.mjs";

describe("workspace-wide task collaboration", () => {
  it.each([true, false])(
    "allows only active workspace participants (recipient active: %s)",
    async (recipientActive) => {
      const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
        if (sql.includes("select p.id from public.projects")) {
          // The lookup must scope both the project and active membership to the workspace.
          expect(sql).toContain("p.workspace_id=$1");
          expect(sql).toContain("m.status='active'");
          expect(sql).toContain("p.status='active'");
          expect(sql).not.toContain("project_members");
          const available = parameters?.[2] === "sender" || recipientActive;
          return { rows: available ? [{ id: "project" }] : [], rowCount: available ? 1 : 0 };
        }
        return { rows: [], rowCount: 0 };
      });
      const requireWorkspaceAccess = vi.fn().mockResolvedValue({ role: "Member" });
      const result = handleTaskAction(
        { query },
        { id: "sender" },
        {
          operation: "inviteToTask",
          workspaceId: "workspace",
          projectId: "project",
          task: "Task",
          memberIds: ["recipient"],
          taskDetails: { id: "11111111-1111-4111-8111-111111111111", urgent: false },
        },
        { requireWorkspaceAccess, uuid: String, timerFromRow: (row) => row },
      );
      if (recipientActive) {
        await expect(result).resolves.toBeNull();
        expect(
          query.mock.calls.some(([sql]) => sql.includes("insert into public.task_invitations")),
        ).toBe(true);
      } else {
        await expect(result).rejects.toMatchObject({ status: 403 });
        expect(
          query.mock.calls.some(([sql]) => sql.includes("insert into public.task_invitations")),
        ).toBe(false);
      }
      expect(requireWorkspaceAccess).toHaveBeenCalledWith({ query }, "sender", "workspace");
    },
  );
});
