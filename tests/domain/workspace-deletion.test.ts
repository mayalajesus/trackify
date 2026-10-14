import { describe, expect, it, vi } from "vitest";
import { deleteWorkspace } from "../../server/data/delete-workspace.mjs";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const user = { id: "owner" };
function setup(role = "Owner", status = "active", timer = false, ownerId = user.id) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.startsWith("select name")) return { rows: [{ name: "Company", owner_id: ownerId }] };
    if (sql.includes("wm.status as membership_status"))
      return { rows: [{ role, membership_status: status, status: "active" }] };
    if (sql.includes("from public.active_timers")) return { rows: timer ? [{ present: 1 }] : [] };
    return { rows: [] };
  });
  return { query };
}
describe("workspace deletion", () => {
  it.each(["Admin", "Member"])("denies %s even when calling the API directly", async (role) => {
    const client = setup(role);
    await expect(
      deleteWorkspace(client, user, { workspaceId, confirmation: "Company" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("delete"))).toBe(false);
  });
  it("denies a removed owner and an inconsistent owner membership", async () => {
    for (const client of [setup("Owner", "removed"), setup("Owner", "active", false, "other")]) {
      await expect(
        deleteWorkspace(client, user, { workspaceId, confirmation: "Company" }),
      ).rejects.toMatchObject({ status: 403 });
      expect(client.query.mock.calls.some(([sql]) => sql.startsWith("delete"))).toBe(false);
    }
  });
  it("requires an exact workspace name", async () => {
    const client = setup();
    await expect(
      deleteWorkspace(client, user, { workspaceId, confirmation: "Other" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("delete"))).toBe(false);
  });
  it("rejects deletion while any member has a running or paused timer", async () => {
    const client = setup("Owner", "active", true);
    await expect(
      deleteWorkspace(client, user, { workspaceId, confirmation: "Company" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("delete"))).toBe(false);
  });
  it("scopes all deletes to the confirmed workspace, without deleting user accounts", async () => {
    const client = setup();
    await expect(
      deleteWorkspace(client, user, { workspaceId, confirmation: "Company" }),
    ).resolves.toBeNull();
    const deletes = client.query.mock.calls.filter(([sql]) => sql.startsWith("delete"));
    expect(deletes).toHaveLength(4);
    for (const [sql, params] of deletes) {
      expect(sql).toMatch(/where (workspace_id|id) = \$1$/);
      expect(sql).not.toContain("profiles");
      expect(params).toEqual([workspaceId]);
    }
  });
});
