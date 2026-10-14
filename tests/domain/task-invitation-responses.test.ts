import { describe, expect, it, vi } from "vitest";
import {
  newTaskInvitationResponses,
  type TaskInvitationResponse,
} from "../../src/lib/task-invitation-responses";
import { handleTaskAction } from "../../server/task-actions.mjs";

const response = (status: TaskInvitationResponse["status"]): TaskInvitationResponse => ({
  id: "invitation",
  task: "Design",
  recipientName: "Ana",
  status,
});

describe("collaboration response notifications", () => {
  it("does not replay historical responses on first use", () => {
    expect(newTaskInvitationResponses(null, [response("accepted")])).toEqual([]);
  });
  it.each(["accepted", "declined"] as const)("notifies a new %s response only once", (status) => {
    expect(newTaskInvitationResponses({ invitation: "pending" }, [response(status)])).toEqual([
      response(status),
    ]);
    expect(newTaskInvitationResponses({ invitation: status }, [response(status)])).toEqual([]);
  });
  it("ignores pending invitations but catches invitations answered between polls", () => {
    expect(newTaskInvitationResponses({}, [response("pending")])).toEqual([]);
    expect(newTaskInvitationResponses({}, [response("accepted")])).toEqual([response("accepted")]);
  });
  it("scopes responses to the authenticated sender and workspace", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [response("accepted")] });
    const requireWorkspaceAccess = vi.fn().mockResolvedValue({});
    const client = { query };
    const result = await handleTaskAction(
      client,
      { id: "sender" },
      {
        operation: "listTaskInvitationResponses",
        workspaceId: "workspace",
        invitedBy: "someone-else",
      },
      { uuid: String, requireWorkspaceAccess, timerFromRow: (row) => row },
    );
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(client, "sender", "workspace");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("i.workspace_id=$1 and i.invited_by=$2"),
      ["workspace", "sender"],
    );
    expect(result).toEqual([response("accepted")]);
  });
  it("does not read responses when workspace access is denied", async () => {
    const query = vi.fn();
    await expect(
      handleTaskAction(
        { query },
        { id: "sender" },
        {
          operation: "listTaskInvitationResponses",
          workspaceId: "workspace",
        },
        {
          uuid: String,
          timerFromRow: (row) => row,
          requireWorkspaceAccess: vi.fn().mockRejectedValue(new Error("Forbidden")),
        },
      ),
    ).rejects.toThrow("Forbidden");
    expect(query).not.toHaveBeenCalled();
  });
});
