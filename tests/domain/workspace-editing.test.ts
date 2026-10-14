import { describe, expect, it, vi } from "vitest";
import { syncAccount } from "../../server/data/sync-account.mjs";
import { createWorkspaceActions } from "../../src/lib/store/workspace-actions";
import type { Role } from "../../src/lib/domain";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const user = { id: "member-1", name: "Test Member", email: "member@example.com" };

function setup(role: Role = "Member") {
  const workspace = { id: workspaceId, ownerId: "owner-1", name: "Company", status: "active" };
  const membership = { userId: user.id, role, status: "active", hourlyRate: 999, currency: "USD" };
  const account = {
    identities: [user],
    workspaces: [
      { workspace, memberships: [membership], settings: { weekStart: "sunday" }, entries: [] },
    ],
  };
  const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
    let rows: Array<Record<string, unknown>> = [];
    if (sql.includes("select owner_id, name, status"))
      rows = [{ owner_id: "owner-1", name: "Company", status: "active" }];
    if (sql.includes("wm.status as membership_status"))
      rows = [{ role, membership_status: "active", status: "active" }];
    return { rows, rowCount: rows.length };
  });
  return { account, query };
}

describe("workspace editing permissions", () => {
  it.each(["Member", "Admin", "Owner"] as const)(
    "guards billing changes in the store for %s",
    (role) => {
      const { account } = setup(role);
      const setAccount = vi.fn();
      const actions = createWorkspaceActions({
        account,
        activeMemberId: user.id,
        setAccount,
      } as unknown as Parameters<typeof createWorkspaceActions>[0]);
      expect(
        actions.setWorkspaceBilling(workspaceId, { hourlyRate: 100, currency: "BRL" }).success,
      ).toBe(role !== "Member");
      expect(setAccount).toHaveBeenCalledTimes(role === "Member" ? 0 : 1);
    },
  );

  it("ignores member billing and settings changes while synchronizing their entries", async () => {
    const { account, query } = setup();
    await expect(
      syncAccount({ query }, user, { databaseProvider: "postgres" }, account),
    ).resolves.toEqual([]);
    const writes = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => /^\s*(insert|update|delete)/i.test(sql));
    expect(
      writes.some((sql) =>
        /\b(?:insert\s+into|update|delete\s+from)\s+public\.(workspace_members|workspace_settings|workspaces)\b/i.test(
          sql,
        ),
      ),
    ).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("delete from public.time_entries"), [
      workspaceId,
      user.id,
      [],
    ]);
  });

  it("rejects a member attempting to rename the workspace directly through the API", async () => {
    const { account, query } = setup();
    account.workspaces[0]!.workspace.name = "Unauthorized change";
    await expect(
      syncAccount({ query }, user, { databaseProvider: "postgres" }, account),
    ).rejects.toMatchObject({ status: 403 });
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into public.workspaces"))).toBe(
      false,
    );
  });
});
