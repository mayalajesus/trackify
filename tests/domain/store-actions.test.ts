import { describe, expect, it, vi } from "vitest";
import { createClientActions } from "../../src/lib/store/client-actions";
import { createProjectActions } from "../../src/lib/store/project-actions";
import { initialPreferences, initialTimer } from "../../src/lib/store/defaults";
import { makeSeedAccount } from "../../src/lib/store/seed-account";
import { shareAccountReferences } from "../../src/lib/store/references";
import type { Client, Project } from "../../src/lib/domain";

function clientContext() {
  const workspace = makeSeedAccount().workspaces[0]!;
  return {
    can: vi.fn(() => true),
    members: [],
    setClients: vi.fn(),
    workspaceBilling: { hourlyRate: 0, currency: "BRL" as const },
    preferences: initialPreferences,
    clients: workspace.clients,
    projects: workspace.projects,
  } satisfies Parameters<typeof createClientActions>[0];
}

describe("store actions preserve domain restrictions", () => {
  it("creates a project without assigning its creator and allows removing every member", () => {
    const account = makeSeedAccount();
    const workspace = account.workspaces[0]!;
    const setProjects = vi.fn();
    const setAccount = vi.fn();
    const context = {
      can: () => true,
      clients: workspace.clients,
      projects: workspace.projects,
      members: [],
      activeMemberId: "u1",
      activeWorkspaceId: workspace.workspace.id,
      entries: workspace.entries,
      timerRef: { current: initialTimer },
      setProjects,
      setAccount,
    };
    const actions = createProjectActions(context);
    expect(
      actions.addProject({ ...workspace.projects[0]!, name: "No members", memberIds: [] }).success,
    ).toBe(true);
    const applyProjects = setProjects.mock.calls[0]![0] as (list: Project[]) => Project[];
    expect(applyProjects(workspace.projects)[0]!.memberIds).toEqual([]);
    const applyAccount = setAccount.mock.calls[0]![0] as (value: typeof account) => typeof account;
    expect(applyAccount(account).workspaces[0]!.projects[0]!.memberIds).toEqual([]);

    setProjects.mockClear();
    const existing = workspace.projects[0]!;
    expect(actions.updateProject(existing.id, { memberIds: [] }).success).toBe(true);
    const applyEdit = setProjects.mock.calls[0]![0] as (list: Project[]) => Project[];
    expect(
      applyEdit(workspace.projects).find((project) => project.id === existing.id)!.memberIds,
    ).toEqual([]);
  });

  it("denies client mutations without permission", () => {
    const context = clientContext();
    context.can.mockReturnValue(false);
    const actions = createClientActions(context);
    expect(actions.addClient({ name: "Client", contact: "" }).success).toBe(false);
    expect(actions.updateClient(context.clients[0]!.id, { name: "Changed" }).success).toBe(false);
    expect(actions.deleteClient(context.clients[0]!.id).success).toBe(false);
    expect(context.setClients).not.toHaveBeenCalled();
  });

  it("preserves the default currency and normalizes new client fields", () => {
    const context = clientContext();
    const result = createClientActions(context).addClient({
      name: " Client ",
      contact: " Contact ",
    });
    expect(result.success).toBe(true);
    const update = context.setClients.mock.calls[0]![0] as (clients: Client[]) => Client[];
    const next = update(context.clients);
    expect(next[0]).toMatchObject({
      name: "Client",
      contact: "Contact",
      currency: "BRL",
      billable: false,
      status: "active",
      contractedHours: null,
      memberIds: [],
    });
    expect(next.slice(1)).toEqual(context.clients);
  });

  it("rejects invalid contracted hours and removal of a linked client", () => {
    const context = clientContext();
    const actions = createClientActions(context);
    expect(actions.addClient({ name: "Client", contact: "", contractedHours: 0 }).success).toBe(
      false,
    );
    expect(actions.deleteClient(context.projects[0]!.clientId).success).toBe(false);
    expect(context.setClients).not.toHaveBeenCalled();
  });

  it("prevents duplicate project names within the same client", () => {
    const account = makeSeedAccount();
    const workspace = account.workspaces[0]!;
    const setProjects = vi.fn();
    const actions = createProjectActions({
      can: () => true,
      clients: workspace.clients,
      projects: workspace.projects,
      members: [],
      activeMemberId: "u1",
      activeWorkspaceId: workspace.workspace.id,
      entries: workspace.entries,
      timerRef: { current: initialTimer },
      setProjects,
      setAccount: vi.fn(),
    });
    const project = workspace.projects[0]!;
    expect(actions.addProject({ ...project, name: ` ${project.name.toUpperCase()} ` })).toEqual({
      success: false,
      error: "A project with this name already exists for this client.",
    });
    expect(setProjects).not.toHaveBeenCalled();
  });
});

describe("account reference sharing", () => {
  it("keeps the account and nested references when a refresh returns equal data", () => {
    const account = makeSeedAccount();
    expect(shareAccountReferences(account, structuredClone(account))).toBe(account);
  });

  it("replaces changed entries while retaining unrelated project and workspace references", () => {
    const account = makeSeedAccount();
    const next = structuredClone(account);
    next.workspaces[0]!.entries[0] = {
      ...next.workspaces[0]!.entries[0]!,
      task: "Changed task",
    };
    const shared = shareAccountReferences(account, next);
    expect(shared.workspaces[0]!.entries).toBe(next.workspaces[0]!.entries);
    expect(shared.workspaces[0]!.projects).toBe(account.workspaces[0]!.projects);
    expect(shared.workspaces[1]).toBe(account.workspaces[1]);
    expect(shared.identities).toBe(account.identities);
  });
});
