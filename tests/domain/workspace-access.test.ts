import { describe, expect, it, vi } from "vitest";
import {
  acceptInvitation,
  createWorkspace,
  listPendingInvitations,
  loadAccount,
} from "../../server/data-api.mjs";

const user = {
  id: "user-without-workspace",
  email: "person@example.com",
  name: "Test Person",
};

function emptyResult(rows: Array<Record<string, unknown>> = []) {
  return { rowCount: rows.length, rows };
}

describe("company workspace access", () => {
  it.each([
    { status: "pending", expires_at: new Date(0), workspace_status: "active" },
    { status: "cancelled", expires_at: new Date(Date.now() + 60_000), workspace_status: "active" },
    { status: "pending", expires_at: new Date(Date.now() + 60_000), workspace_status: "archived" },
  ])("does not grant unavailable invitations: %j", async (state) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("select p.name, p.email, p.initials"))
        return emptyResult([{ name: user.name, email: user.email }]);
      if (sql.includes("from public.workspace_invitations invitation"))
        return emptyResult([
          {
            id: "33333333-3333-4333-8333-333333333333",
            workspace_id: "11111111-1111-4111-8111-111111111111",
            email: user.email,
            role: "Member",
            invited_at: new Date(),
            ...state,
          },
        ]);
      return emptyResult();
    });
    await expect(
      acceptInvitation(
        { query },
        user,
        { databaseProvider: "postgres" },
        {
          invitationId: "33333333-3333-4333-8333-333333333333",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      query.mock.calls.some(([sql]) => sql.includes("insert into public.workspace_members")),
    ).toBe(false);
  });
  it("discovers invitations only for the authenticated email and excludes unavailable workspaces", async () => {
    const query = vi
      .fn()
      .mockResolvedValue(emptyResult([{ id: "invite-1", workspace_name: "Company" }]));
    await expect(
      listPendingInvitations({ query }, { ...user, email: " Person@Example.com " }),
    ).resolves.toEqual([{ id: "invite-1", workspaceName: "Company" }]);
    const [sql, parameters] = query.mock.calls[0]!;
    expect(parameters).toEqual(["person@example.com", user.id]);
    expect(sql).toContain("lower(trim(invitation.email)) = $1");
    expect(sql).toContain("invitation.status = 'pending'");
    expect(sql).toContain("invitation.expires_at > now()");
    expect(sql).toContain("workspace.status <> 'archived'");
    expect(sql).toContain("member.user_id = $2 and member.status = 'active'");
  });
  it.each(["pt-BR", "en-US", undefined])(
    "loads preferences without a workspace, preserving saved language %s",
    async (language) => {
      const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
        if (sql.includes("select p.name, p.email, p.initials")) {
          return emptyResult([{ name: user.name, email: user.email }]);
        }
        if (sql.includes("information_schema.columns")) return emptyResult([{ present: false }]);
        if (sql.includes("select distinct p.id")) {
          return emptyResult([
            {
              id: user.id,
              name: user.name,
              email: user.email,
              initials: "TP",
              avatar_path: null,
            },
          ]);
        }
        if (sql.includes("from public.user_preferences where user_id")) {
          return emptyResult([
            {
              user_id: user.id,
              language,
              theme: "system",
              timezone: "America/Sao_Paulo",
              idle_detection: true,
              avatar_data_url: null,
              active_workspace_id: null,
              report_filters: {},
            },
          ]);
        }
        return emptyResult();
      });

      const account = await loadAccount({ query }, user, { databaseProvider: "postgres" });

      expect(account.workspaces).toEqual([]);
      expect(account.identities).toEqual([
        { id: user.id, name: user.name, email: user.email, initials: "TP" },
      ]);
      expect(account.preferencesByUserId[user.id]).toMatchObject({
        language: language === "en-US" ? "en-US" : "pt-BR",
        timezone: "America/Sao_Paulo",
        activeWorkspaceId: null,
      });
    },
  );

  it("lets any authenticated user create a company workspace as its owner", async () => {
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes("select p.name, p.email, p.initials")) {
        return emptyResult([{ name: user.name, email: user.email }]);
      }
      if (sql.includes("select count(*)::integer as count")) {
        return emptyResult([{ count: 0 }]);
      }
      if (sql.includes("information_schema.columns")) return emptyResult([{ present: true }]);
      return emptyResult();
    });

    const result = await createWorkspace(
      { query },
      user,
      { databaseProvider: "postgres" },
      { name: "Acme Studio", hourlyRate: 150, currency: "BRL" },
    );

    expect(result.workspaceId).toMatch(/^[0-9a-f-]{36}$/i);
    const workspaceInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes("insert into public.workspaces"),
    );
    expect(workspaceInsert?.[1]).toEqual([result.workspaceId, "Acme Studio", user.id]);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("set active_workspace_id = $2")),
    ).toBe(true);
  });

  it("limits a user to five owned workspaces", async () => {
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes("select p.name, p.email, p.initials")) {
        return emptyResult([{ name: user.name, email: user.email }]);
      }
      if (sql.includes("select count(*)::integer as count")) {
        return emptyResult([{ count: 5 }]);
      }
      return emptyResult();
    });

    await expect(
      createWorkspace(
        { query },
        user,
        { databaseProvider: "postgres" },
        { name: "Sixth company", hourlyRate: 100, currency: "USD" },
      ),
    ).rejects.toMatchObject({ status: 409, message: "You can create up to 5 workspaces." });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("insert into public.workspaces")),
    ).toBe(false);
  });

  it("accepts the same invitation idempotently for the same authenticated user", async () => {
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const invitationId = "22222222-2222-4222-8222-222222222222";
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes("select p.name, p.email, p.initials")) {
        return emptyResult([{ name: user.name, email: user.email }]);
      }
      if (sql.includes("from public.workspace_invitations invitation")) {
        return emptyResult([
          {
            id: invitationId,
            workspace_id: workspaceId,
            email: user.email,
            role: "Member",
            status: "accepted",
            invited_at: new Date("2026-09-01T12:00:00Z"),
            expires_at: new Date("2026-10-01T12:00:00Z"),
            auth_user_id: user.id,
            workspace_status: "active",
          },
        ]);
      }
      if (sql.includes("select 1 from public.workspace_members")) return emptyResult([{}]);
      if (sql.includes("information_schema.columns")) return emptyResult([{ present: true }]);
      return emptyResult();
    });

    await expect(
      acceptInvitation({ query }, user, { databaseProvider: "postgres" }, { invitationId }),
    ).resolves.toEqual({ workspaceId });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("insert into public.workspace_members"),
      ),
    ).toBe(false);
  });

  it("does not grant an invitation issued to another email", async () => {
    const invitationId = "33333333-3333-4333-8333-333333333333";
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes("select p.name, p.email, p.initials")) {
        return emptyResult([{ name: user.name, email: user.email }]);
      }
      if (sql.includes("from public.workspace_invitations invitation")) {
        return emptyResult([
          {
            id: invitationId,
            workspace_id: "11111111-1111-4111-8111-111111111111",
            email: "someone-else@example.com",
            role: "Member",
            status: "pending",
            invited_at: new Date(),
            expires_at: new Date(Date.now() + 60_000),
            auth_user_id: null,
            workspace_status: "active",
          },
        ]);
      }
      return emptyResult();
    });

    await expect(
      acceptInvitation({ query }, user, { databaseProvider: "postgres" }, { invitationId }),
    ).rejects.toMatchObject({
      status: 403,
      message: "This invitation belongs to a different email address.",
    });
  });
});
