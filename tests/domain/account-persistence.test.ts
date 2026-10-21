import { describe, expect, it, vi } from "vitest";
import { createAccountPersistence } from "../../src/lib/store/account-persistence";
import type { AccountDataSource } from "../../src/lib/account-data-source";
import { makeSeedAccount } from "../../src/lib/store/seed-account";
import { createApiDataSource } from "../../src/lib/api-data-source";

function setup() {
  const base = makeSeedAccount();
  const draft = structuredClone(base);
  draft.workspaces[0]!.workspace.name = "Pending name";
  const snapshotRef = { current: draft };
  const syncedRef = { current: base };
  const queueRef = { current: null as Promise<void> | null };
  const syncAccount = vi.fn<AccountDataSource["syncAccount"]>();
  const onSaved = vi.fn(),
    onError = vi.fn(),
    isCurrent = vi.fn(() => true);
  const persist = createAccountPersistence({
    userId: "user",
    dataSource: { syncAccount },
    isCurrent,
    snapshotRef,
    syncedRef,
    queueRef,
    onSaved,
    onError,
  });
  return { base, draft, snapshotRef, syncedRef, syncAccount, onSaved, onError, isCurrent, persist };
}

describe("account persistence recovery", () => {
  it("never sends a save before the durable journal commits, including timer-only edits", async () => {
    const ctx = setup();
    const protect = vi.fn().mockRejectedValue(new Error("Storage unavailable"));
    const persist = createAccountPersistence({
      userId: "user",
      dataSource: { syncAccount: ctx.syncAccount },
      isCurrent: ctx.isCurrent,
      snapshotRef: ctx.snapshotRef,
      syncedRef: ctx.syncedRef,
      queueRef: { current: null },
      onSaved: ctx.onSaved,
      onError: ctx.onError,
      beforeSave: protect,
    });
    expect(await persist()).toBe(false);
    expect(ctx.syncAccount).not.toHaveBeenCalled();
    expect(ctx.snapshotRef.current).toBe(ctx.draft);
    ctx.snapshotRef.current = ctx.base;
    expect(await persist()).toBe(false);
    expect(protect).toHaveBeenCalledTimes(2);
  });
  it("refuses writes to a server that has not advertised safe synchronization", async () => {
    const base = makeSeedAccount();
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      expect(await createApiDataSource().syncAccount("user", base, base)).toMatchObject({
        success: false,
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("does not advance the baseline or replace the draft after a conflict", async () => {
    const ctx = setup();
    ctx.syncAccount.mockResolvedValue({ success: false, code: "sync_conflict", error: "Conflict" });
    expect(await ctx.persist()).toBe(false);
    expect(ctx.syncedRef.current).toBe(ctx.base);
    expect(ctx.snapshotRef.current).toBe(ctx.draft);
    expect(ctx.onSaved).not.toHaveBeenCalled();
  });

  it("keeps the draft and baseline after a failed save and retries the same changes", async () => {
    const ctx = setup();
    ctx.syncAccount
      .mockResolvedValueOnce({ success: false, error: "Offline" })
      .mockResolvedValueOnce({ success: true, data: ctx.draft });
    expect(await ctx.persist()).toBe(false);
    expect(ctx.snapshotRef.current).toBe(ctx.draft);
    expect(ctx.syncedRef.current).toBe(ctx.base);
    expect(ctx.onSaved).not.toHaveBeenCalled();
    expect(await ctx.persist()).toBe(true);
    expect(ctx.syncAccount.mock.calls[1]).toEqual(["user", ctx.draft, ctx.base]);
    expect(ctx.onError).toHaveBeenLastCalledWith(null);
  });

  it("keeps edits made during a save and uses the returned server baseline in the next save", async () => {
    const ctx = setup();
    let complete!: (result: Awaited<ReturnType<AccountDataSource["syncAccount"]>>) => void;
    ctx.syncAccount
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockImplementationOnce(async (_user, account) => ({ success: true, data: account }));
    const first = ctx.persist();
    await vi.waitFor(() => expect(ctx.syncAccount).toHaveBeenCalledTimes(1));
    const latest = structuredClone(ctx.draft);
    latest.workspaces[0]!.workspace.name = "Second edit";
    ctx.snapshotRef.current = latest;
    const second = ctx.persist();
    const saved = structuredClone(ctx.draft);
    saved.workspaces[0]!.clients.push({ ...saved.workspaces[0]!.clients[0]!, id: "remote-client" });
    complete({ success: true, data: saved });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(ctx.syncAccount.mock.calls[1]![2]).toBe(saved);
    expect(ctx.snapshotRef.current.workspaces[0]!.workspace.name).toBe("Second edit");
    expect(
      ctx.snapshotRef.current.workspaces[0]!.clients.some(
        (client) => client.id === "remote-client",
      ),
    ).toBe(true);
  });

  it("does not acknowledge a save after switching accounts", async () => {
    const ctx = setup();
    ctx.syncAccount.mockImplementation(async () => {
      ctx.isCurrent.mockReturnValue(false);
      return { success: true, data: ctx.draft };
    });
    expect(await ctx.persist()).toBe(false);
    expect(ctx.onSaved).not.toHaveBeenCalled();
    expect(ctx.syncedRef.current).toBe(ctx.base);
  });

  it("recovers from thrown network errors without breaking the write queue", async () => {
    const ctx = setup();
    ctx.syncAccount
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce({ success: true, data: ctx.draft });
    expect(await ctx.persist()).toBe(false);
    expect(ctx.onError).toHaveBeenCalledWith("Connection lost");
    expect(await ctx.persist()).toBe(true);
  });
});
