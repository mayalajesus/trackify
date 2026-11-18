import { describe, expect, it, vi } from "vitest";
import { createConditionalReads, readsAffectedBy } from "../../src/lib/conditional-reads";

describe("conditional reads", () => {
  it("saving filter preferences does not interrupt an in-flight report", async () => {
    const cache = createConditionalReads();
    let resolve!: (value: { success: true; data: object }) => void;
    const send = vi.fn(
      () =>
        new Promise<{ success: true; data: object }>((done) => {
          resolve = done;
        }),
    );
    const pending = cache.read("loadReportEntries", {}, send);
    cache.invalidate(readsAffectedBy("updatePreferences"));
    resolve({
      success: true,
      data: { readProtocol: 1, notModified: false, revision: "report", data: [] },
    });
    expect(await pending).toMatchObject({ success: true, data: [] });
  });
  it("revalidates every read, deduplicates concurrent callers and isolates returned data", async () => {
    const cache = createConditionalReads();
    cache.setScope("session-a");
    const send = vi.fn().mockResolvedValue({
      success: true,
      data: { readProtocol: 1, notModified: false, revision: "r1", data: [{ task: "Original" }] },
    });
    const [a, b] = await Promise.all([
      cache.read<Array<{ task: string }>>("loadAccount", {}, send),
      cache.read<Array<{ task: string }>>("loadAccount", {}, send),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    if (a.success) a.data[0]!.task = "Edited locally";
    expect(b).toMatchObject({ data: [{ task: "Original" }] });
    send.mockResolvedValue({
      success: true,
      data: { readProtocol: 1, notModified: true, revision: "r1" },
    });
    expect(await cache.read("loadAccount", {}, send)).toMatchObject({
      data: [{ task: "Original" }],
    });
    expect(send).toHaveBeenLastCalledWith({ readProtocol: 1, ifRevision: "r1" });
  });
  it("never extends an invitation's original deadline", async () => {
    let now = 1000;
    const cache = createConditionalReads(() => now);
    const send = vi.fn().mockResolvedValue({
      success: true,
      data: {
        readProtocol: 1,
        notModified: false,
        revision: "r",
        data: [{ id: "invite", validForMs: 6000 }],
      },
    });
    await cache.read("listTaskInvitations", {}, send);
    send.mockResolvedValue({
      success: true,
      data: { readProtocol: 1, notModified: true, revision: "r" },
    });
    now += 5000;
    expect(await cache.read("listTaskInvitations", {}, send)).toMatchObject({
      data: [{ validForMs: 1000 }],
    });
    now += 1000;
    expect(await cache.read("listTaskInvitations", {}, send)).toMatchObject({ data: [] });
  });
  it("discards responses crossing mutations or session changes", async () => {
    const cache = createConditionalReads();
    let resolve!: (value: { success: true; data: object }) => void;
    const send = vi.fn(
      () =>
        new Promise<{ success: true; data: object }>((done) => {
          resolve = done;
        }),
    );
    const pending = cache.read("loadAccount", {}, send);
    cache.invalidate();
    resolve({
      success: true,
      data: { readProtocol: 1, notModified: false, revision: "old", data: {} },
    });
    expect(await pending).toMatchObject({ success: false, code: "read_superseded" });
    cache.setScope("other-user");
    const next = vi.fn().mockResolvedValue({ success: true, data: [] });
    await cache.read("loadAccount", {}, next);
    expect(next).toHaveBeenCalledWith({ readProtocol: 1 });
  });
  it("preserves error results, backs off, and permits immediate revalidation on reconnect", async () => {
    let now = 0;
    const cache = createConditionalReads(() => now);
    const send = vi
      .fn()
      .mockResolvedValue({ success: false, error: "Unavailable", retryAfter: 30 });
    await cache.read("loadAccount", {}, send);
    now = 10000;
    expect(await cache.read("loadAccount", {}, send)).toMatchObject({ success: false });
    expect(send).toHaveBeenCalledTimes(1);
    cache.resetFailures();
    await cache.read("loadAccount", {}, send);
    expect(send).toHaveBeenCalledTimes(1); // Explicit Retry-After remains binding.
    now = 30000;
    await cache.read("loadAccount", {}, send);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("keeps report windows separate and rejects an invalid notModified reply", async () => {
    const cache = createConditionalReads();
    const send = vi.fn().mockResolvedValue({
      success: true,
      data: { readProtocol: 1, notModified: true, revision: "missing" },
    });
    expect(await cache.read("loadReportEntries", { startDate: "2026-11-01" }, send)).toMatchObject({
      success: false,
    });
    send.mockResolvedValue({
      success: true,
      data: { readProtocol: 1, notModified: false, revision: "r", data: [] },
    });
    await cache.read("loadReportEntries", { startDate: "2026-11-01" }, send);
    await cache.read("loadReportEntries", { startDate: "2026-10-01" }, send);
    expect(send).toHaveBeenLastCalledWith({ startDate: "2026-10-01", readProtocol: 1 });
  });
});
