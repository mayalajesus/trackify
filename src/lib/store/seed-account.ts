import type { PersistedAccount, WorkspaceData } from "../account-types";

import {
  clients as seedClients,
  timeEntries as seedEntries,
  members as seedMembers,
  projects as seedProjects,
} from "../mock-data";

import type { Member } from "../domain";

import { initialSettings } from "./defaults";

import { initialPreferences } from "./defaults";

import { initialTrello } from "./defaults";

import { membersToMemberships } from "./membership";

import { createIdentity } from "./membership";

export function makeSeedAccount(): PersistedAccount {
  const identities = seedMembers.map(createIdentity);
  const defaultWorkspaceId = "w1";
  const sharedWorkspaceId = "w2";
  const defaultWorkspace: WorkspaceData = {
    workspace: {
      id: defaultWorkspaceId,
      name: "Studio Co.",
      ownerId: "u1",
      logoDataUrl: null,
      status: "active",
      createdAt: "2026-08-01T09:00:00.000Z",
    },
    memberships: membersToMemberships(defaultWorkspaceId, seedMembers),
    entries: seedEntries,
    projects: seedProjects,
    clients: seedClients,
    settings: { ...initialSettings },
    trello: initialTrello,
  };
  const sharedMembers: Member[] = [
    { ...seedMembers[1]!, role: "Owner" },
    { ...seedMembers[0]!, role: "Member" },
    { ...seedMembers[2]!, role: "Member" },
  ];
  const sharedWorkspace: WorkspaceData = {
    workspace: {
      id: sharedWorkspaceId,
      name: "Product Lab",
      ownerId: "u2",
      logoDataUrl: null,
      status: "active",
      createdAt: "2026-08-05T09:00:00.000Z",
    },
    memberships: membersToMemberships(sharedWorkspaceId, sharedMembers),
    entries: seedEntries.filter((entry) => entry.projectId === "p1"),
    projects: seedProjects.filter((project) => project.id === "p1"),
    clients: seedClients.filter((client) => client.id === "c1"),
    settings: { ...initialSettings },
    trello: initialTrello,
  };
  return {
    version: 13,
    identities,
    workspaces: [defaultWorkspace, sharedWorkspace],
    preferencesByUserId: Object.fromEntries(
      identities.map((identity) => [identity.id, { ...initialPreferences }]),
    ),
  };
}
