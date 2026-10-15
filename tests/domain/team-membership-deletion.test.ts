import { describe, expect, it, vi } from "vitest";
import { deleteMember } from "../../server/data/members.mjs";
import { syncAccount } from "../../server/data/sync-account.mjs";
import { createMemberActions } from "../../src/lib/store/member-actions";
import { membershipToMember, membersToMemberships } from "../../src/lib/store/membership";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deletedAt = "2026-10-13T18:00:00.000Z";
const user = { id: "owner", name: "Team Owner", email: "owner@example.com" };
const target = {
  id: "member",
  name: "Past Member",
  email: "member@example.com",
  initials: "PM",
  role: "Member" as const,
  status: "active" as const,
};

function database(actorRole = "Owner", targetRole = "Member", timer = false) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("wm.status as membership_status"))
      rows = [{ role: actorRole, status: "active", membership_status: "active" }];
    if (sql.includes("information_schema.columns")) rows = [{ present: true }];
    if (sql.startsWith("select role, status, deleted_at"))
      rows = [{ role: targetRole, status: "active" }];
    if (sql.includes("select 1 from public.active_timers") && timer) rows = [{}];
    if (sql.includes("returning deleted_at")) rows = [{ deleted_at: deletedAt }];
    return { rows, rowCount: rows.length };
  });
  return { query };
}

describe("permanent team membership deletion", () => {
  it.each([
    ["Member", "Member"],
    ["Admin", "Admin"],
    ["Owner", "Owner"],
  ])("denies %s deleting %s", async (actor, role) => {
    const client = database(actor, role);
    await expect(
      deleteMember(client, user, { workspaceId, memberId: target.id }),
    ).rejects.toMatchObject({ status: 403 });
    expect(client.query.mock.calls.some(([sql]) => /^(update|delete)/.test(sql))).toBe(false);
  });

  it("denies self deletion and preserves a timer that has not been saved", async () => {
    await expect(
      deleteMember(database(), user, { workspaceId, memberId: user.id }),
    ).rejects.toMatchObject({ status: 403 });
    const client = database("Owner", "Member", true);
    await expect(
      deleteMember(client, user, { workspaceId, memberId: target.id }),
    ).rejects.toMatchObject({ status: 409 });
    expect(client.query.mock.calls.some(([sql]) => /^(update|delete)/.test(sql))).toBe(false);
  });

  it.each(["Owner", "Admin"])(
    "allows %s to revoke a member, scoped to the selected workspace, without changing time history",
    async (role) => {
      const client = database(role);
      await expect(
        deleteMember(client, user, { workspaceId, memberId: target.id }),
      ).resolves.toEqual({ deletedAt });
      const writes = client.query.mock.calls.filter(([sql]) => /^(update|delete)/.test(sql));
      expect(writes).toHaveLength(3);
      for (const [sql, values] of writes) {
        expect(sql).toContain("workspace_id = $1");
        expect(values).toEqual([workspaceId, target.id]);
        expect(sql).not.toMatch(/public\.(profiles|time_entries|active_timers)/);
      }
      expect(writes[0]![0]).toContain("status = 'removed', deleted_at = now()");
    },
  );

  it("explains a timer stranded by an already removed membership without deleting hours", async () => {
    const client = database("Owner", "Member", true);
    const original = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith("select role, status, deleted_at"))
        return { rows: [{ role: "Member", status: "removed" }], rowCount: 1 };
      return original(sql, values);
    });
    await expect(
      deleteMember(client, user, { workspaceId, memberId: target.id }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("unfinished timer from before access was revoked"),
    });
    expect(client.query.mock.calls.some(([sql]) => /^(update|delete)/.test(sql))).toBe(false);
  });

  it("prevents revoking access while a timer is still pending", async () => {
    const query = vi.fn(async (sql: string, _values?: unknown[]) => {
      let rows: Record<string, unknown>[] = [];
      if (sql.includes("select owner_id, name, status"))
        rows = [{ owner_id: user.id, name: "Team", status: "active" }];
      if (sql.includes("wm.status as membership_status"))
        rows = [{ role: "Owner", status: "active", membership_status: "active" }];
      if (sql.includes("select role, status,")) rows = [{ role: "Member", status: "active" }];
      if (sql.includes("select 1 from public.active_timers")) rows = [{}];
      return { rows, rowCount: rows.length };
    });
    await expect(
      syncAccount(
        { query },
        user,
        { databaseProvider: "postgres" },
        {
          identities: [user, target],
          workspaces: [
            {
              workspace: { id: workspaceId, ownerId: user.id, name: "Team", status: "active" },
              memberships: [
                {
                  userId: target.id,
                  role: "Member",
                  status: "removed",
                  hourlyRate: 0,
                  currency: "BRL",
                },
              ],
            },
          ],
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Stop this member's timer before removing their team access.",
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("select 1 from public.active_timers"),
      [workspaceId, target.id],
    );
    expect(
      query.mock.calls.some(([sql]) => sql.includes("insert into public.workspace_members")),
    ).toBe(false);
  });

  it("keeps the historical identity and deletion marker through store serialization", () => {
    const membership = {
      workspaceId,
      userId: target.id,
      role: target.role,
      status: "removed" as const,
      hourlyRate: 25,
      currency: "BRL" as const,
      deletedAt,
    };
    const member = membershipToMember(membership, [target])!;
    expect(member.name).toBe(target.name);
    expect(member.deletedAt).toBe(deletedAt);
    expect(membersToMemberships(workspaceId, [member], [membership])[0]).toEqual(membership);
    const actions = createMemberActions({
      can: () => true,
      members: [member],
    } as unknown as Parameters<typeof createMemberActions>[0]);
    expect(actions.restoreMember(target.id).success).toBe(false);
    expect(actions.updateMemberRole(target.id, "Admin").success).toBe(false);
  });

  it("rejects a stale account snapshot trying to restore a deleted membership", async () => {
    const query = vi.fn(async (sql: string, _values?: unknown[]) => {
      let rows: Record<string, unknown>[] = [];
      if (sql.includes("select owner_id, name, status"))
        rows = [{ owner_id: user.id, name: "Team", status: "active" }];
      if (sql.includes("wm.status as membership_status"))
        rows = [{ role: "Owner", status: "active", membership_status: "active" }];
      if (sql.includes("select role, status,"))
        rows = [{ role: "Member", status: "removed", deleted_at: deletedAt }];
      return { rows, rowCount: rows.length };
    });
    await expect(
      syncAccount(
        { query },
        user,
        { databaseProvider: "postgres" },
        {
          identities: [user, target],
          workspaces: [
            {
              workspace: { id: workspaceId, ownerId: user.id, name: "Team", status: "active" },
              memberships: [
                {
                  userId: target.id,
                  role: "Member",
                  status: "active",
                  hourlyRate: 0,
                  currency: "BRL",
                },
              ],
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      query.mock.calls.some(([sql]) => sql.includes("insert into public.workspace_members")),
    ).toBe(false);
  });
});
