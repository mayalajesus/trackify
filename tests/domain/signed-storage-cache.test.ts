import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("../../server/data/connections.mjs", () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }),
}));
// @ts-expect-error server module intentionally has no public TypeScript API
import { signedStorageUrl } from "../../server/data/storage.mjs";

afterEach(() => vi.useRealTimers());
describe("signed storage URL reuse", () => {
  it("deduplicates requests and renews before expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const config = {
      databaseProvider: "supabase",
      supabaseUrl: "https://cache-qa.example",
      supabaseServiceRoleKey: "qa",
    };
    mocks.sign.mockResolvedValueOnce({ data: { signedUrl: "url-1" } });
    expect(
      await Promise.all([
        signedStorageUrl(config, "avatars", "user/a"),
        signedStorageUrl(config, "avatars", "user/a"),
      ]),
    ).toEqual(["url-1", "url-1"]);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    vi.setSystemTime(24 * 60 * 60_000 - 4 * 60_000);
    mocks.sign.mockResolvedValueOnce({ data: { signedUrl: "url-2" } });
    expect(await signedStorageUrl(config, "avatars", "user/a")).toBe("url-2");
    expect(mocks.sign).toHaveBeenCalledTimes(2);
  });
  it("does not cache failures or share an object across projects", async () => {
    mocks.sign.mockReset().mockResolvedValueOnce({ error: { message: "Unavailable" } });
    const config = {
      databaseProvider: "supabase",
      supabaseUrl: "https://failure-qa.example",
      supabaseServiceRoleKey: "qa",
    };
    await expect(signedStorageUrl(config, "avatars", "user/b")).rejects.toThrow();
    mocks.sign.mockResolvedValue({ data: { signedUrl: "recovered" } });
    await signedStorageUrl(config, "avatars", "user/b");
    await signedStorageUrl(
      { ...config, supabaseUrl: "https://other-qa.example" },
      "avatars",
      "user/b",
    );
    expect(mocks.sign).toHaveBeenCalledTimes(3);
  });
});
