import { describe, expect, it } from "vitest";
import {
  isValidAccount,
  makeSeedAccount,
  migrateAccountSnapshot,
  repairDuplicateEntryIds,
  type PersistedAccount,
} from "../../src/lib/store";

describe("local account persistence", () => {
  it.each([true, false])(
    "accepts old snapshots with idleDetection=%s without requiring it",
    (idleDetection) => {
      const account = makeSeedAccount();
      expect(isValidAccount(account)).toBe(true);
      const legacy = {
        ...account,
        preferencesByUserId: Object.fromEntries(
          Object.entries(account.preferencesByUserId).map(([id, preferences]) => [
            id,
            { ...preferences, idleDetection },
          ]),
        ),
      };
      expect(isValidAccount(legacy)).toBe(true);
      const migrated = migrateAccountSnapshot({ ...legacy, version: 12 });
      expect(migrated).not.toBeNull();
      expect(isValidAccount(migrated)).toBe(true);
      for (const preferences of Object.values(migrated!.preferencesByUserId)) {
        expect(preferences).not.toHaveProperty("idleDetection");
      }
    },
  );

  it("accepts an authenticated account with profile preferences and no workspace", () => {
    const account: PersistedAccount = {
      version: 13,
      identities: [
        {
          id: "new-user",
          name: "New User",
          email: "new.user@example.com",
          initials: "NU",
        },
      ],
      workspaces: [],
      preferencesByUserId: {
        "new-user": {
          language: "en-US",
          theme: "system",
          avatarUrl: null,
          timezone: "UTC",
          activeWorkspaceId: null,
          reportFilters: {},
        },
      },
    };

    expect(isValidAccount(account)).toBe(true);
  });

  it("accepts the current snapshot after changing one user's theme", () => {
    const account = makeSeedAccount();
    const preferences = account.preferencesByUserId["u1"];
    if (!preferences) throw new Error("The seed account must include user u1.");
    account.preferencesByUserId["u1"] = {
      ...preferences,
      theme: "dark",
    };

    expect(isValidAccount(JSON.parse(JSON.stringify(account)))).toBe(true);
  });

  it("moves version 11 billing preferences to every workspace membership", () => {
    const current = makeSeedAccount();
    const firstEntry = current.workspaces[0]?.entries[0];
    const legacy = {
      ...structuredClone(current),
      version: 11,
      workspaces: current.workspaces.map((workspace) => ({
        ...structuredClone(workspace),
        memberships: workspace.memberships.map((membership) => {
          const { hourlyRate: _hourlyRate, currency: _currency, ...legacyMembership } = membership;
          return legacyMembership;
        }),
      })),
      preferencesByUserId: Object.fromEntries(
        Object.entries(current.preferencesByUserId).map(([userId, preferences]) => [
          userId,
          { ...preferences, hourlyRate: userId === "u1" ? 180 : 95, currency: "BRL" },
        ]),
      ),
    };

    const migrated = migrateAccountSnapshot(legacy);

    expect(migrated?.version).toBe(13);
    expect(migrated?.workspaces[0]?.entries).toEqual(current.workspaces[0]?.entries);
    expect(migrated?.workspaces[0]?.entries[0]).toEqual(firstEntry);
    expect(
      migrated?.workspaces.map((workspace) =>
        workspace.memberships.find((membership) => membership.userId === "u1"),
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ hourlyRate: 180, currency: "BRL" })]),
    );
    expect(migrated?.preferencesByUserId["u1"]).not.toHaveProperty("hourlyRate");
    expect(migrated?.preferencesByUserId["u1"]).not.toHaveProperty("currency");
  });

  it("repairs duplicate entry IDs without changing the original records", () => {
    const account = JSON.parse(JSON.stringify(makeSeedAccount())) as PersistedAccount;
    const firstEntry = account.workspaces[0]?.entries[0];
    if (!firstEntry) throw new Error("The seed account must include a time entry.");

    account.workspaces[0]?.entries.push({ ...firstEntry });

    expect(isValidAccount(account)).toBe(false);

    const repaired = repairDuplicateEntryIds(account) as PersistedAccount;
    const repairedEntries = repaired.workspaces[0]?.entries ?? [];

    expect(isValidAccount(repaired)).toBe(true);
    expect(repairedEntries[0]?.id).toBe(firstEntry.id);
    expect(repairedEntries[1]?.id).not.toBe(firstEntry.id);
    expect(new Set(repairedEntries.map((entry) => entry.id)).size).toBe(repairedEntries.length);
  });
});
