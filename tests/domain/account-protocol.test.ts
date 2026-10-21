import { describe, expect, it, vi } from "vitest";
import { shareAccountReferences } from "../../src/lib/store/references";
import { makeSeedAccount } from "../../src/lib/store/seed-account";
import { synchronizeAccount } from "../../server/data/account-sync.mjs";

describe("account synchronization protocol upgrades", () => {
  it("preserves the conditional timer-write protocol on unchanged records", () => {
    const previous = makeSeedAccount();
    const next = { ...previous, timerSyncProtocol: 1 as const };
    expect(shareAccountReferences(previous, next).timerSyncProtocol).toBe(1);
  });
  it("keeps protocol upgrades even when account records have not changed", () => {
    const previous = makeSeedAccount();
    const next = { ...structuredClone(previous), syncProtocol: 1 as const };
    const shared = shareAccountReferences(previous, next);
    expect(shared).not.toBe(previous);
    expect(shared.syncProtocol).toBe(1);
    expect(shared.workspaces).toBe(previous.workspaces);
    expect(shared.identities).toBe(previous.identities);
    expect(shareAccountReferences(shared, structuredClone(next))).toBe(shared);
  });

  it("does not retain a protocol that is no longer advertised by the server", () => {
    const next = makeSeedAccount();
    const previous = { ...structuredClone(next), syncProtocol: 1 as const };
    expect(shareAccountReferences(previous, next).syncProtocol).toBeUndefined();
  });

  it("rejects old snapshots without writing and gives legacy clients actionable Portuguese text", async () => {
    const client = { query: vi.fn() };
    await expect(
      synchronizeAccount(
        client,
        { id: "user", email: "test@example.com" },
        {},
        {
          account: makeSeedAccount(),
        },
      ),
    ).rejects.toMatchObject({
      code: "sync_baseline_required",
      message: expect.stringContaining("versão antiga do Trackify"),
    });
    expect(client.query).not.toHaveBeenCalled();
  });
});
