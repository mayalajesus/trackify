import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginExtensionConnection,
  parseExtensionConnectRequest,
} from "../../src/lib/extension-connect";
import {
  enforceExtensionOperation,
  isAllowedExtensionOrigin,
} from "../../server/extension-origin.mjs";

const id = "a".repeat(32);
const state = "b".repeat(64);
afterEach(() => vi.unstubAllGlobals());
describe("integration connection switch", () => {
  it("requests consent from an installed allowlisted extension without credentials", async () => {
    const sendMessage = vi.fn((_id, _message, reply) => reply({ success: true }));
    vi.stubGlobal("window", { setTimeout, clearTimeout, chrome: { runtime: { sendMessage } } });
    await beginExtensionConnection(`invalid,${id},${id}`);
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith(
      id,
      { type: "TRACKIFY_BEGIN_CONNECT", version: 1 },
      expect.any(Function),
    );
  });
  it("reports unavailable or outdated extensions without pretending to connect", async () => {
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      chrome: {
        runtime: {
          sendMessage: (_id: string, _message: unknown, reply: (response: unknown) => void) =>
            reply({ success: false }),
        },
      },
    });
    await expect(beginExtensionConnection(id)).rejects.toThrow("Instale ou atualize");
    await expect(beginExtensionConnection("")).rejects.toThrow("Instale ou atualize");
  });
});
describe("extension authorization boundaries", () => {
  it("requires an explicitly registered extension and a valid state", () => {
    expect(parseExtensionConnectRequest(`?extensionId=${id}&state=${state}`, id)).toEqual({
      extensionId: id,
      state,
    });
    expect(parseExtensionConnectRequest(`?extensionId=${id}&state=${state}`, "")).toBeNull();
    expect(parseExtensionConnectRequest(`?extensionId=${id}&state=short`, id)).toBeNull();
    expect(
      parseExtensionConnectRequest(`?extensionId=${"z".repeat(32)}&state=${state}`, "z".repeat(32)),
    ).toBeNull();
  });
  it("accepts only exact allowlisted Chrome origins", () => {
    expect(isAllowedExtensionOrigin(`chrome-extension://${id}`, id)).toBe(true);
    for (const origin of [
      `https://${id}`,
      `chrome-extension://${id}.evil.test`,
      `chrome-extension://${id}/`,
      `chrome-extension://${"b".repeat(32)}`,
    ]) {
      expect(isAllowedExtensionOrigin(origin, id)).toBe(false);
    }
    expect(isAllowedExtensionOrigin(`chrome-extension://${id}`)).toBe(false);
  });
  it("limits browser extension requests to dedicated session and timer operations", () => {
    expect(() =>
      enforceExtensionOperation(`chrome-extension://${id}`, "getExtensionSession"),
    ).not.toThrow();
    for (const operation of ["getExtensionContext", "extensionTimerAction"])
      expect(() => enforceExtensionOperation(`chrome-extension://${id}`, operation)).not.toThrow();
    expect(() =>
      enforceExtensionOperation(`chrome-extension://${id}`, "saveActiveTimer"),
    ).toThrow();
    expect(() => enforceExtensionOperation(`chrome-extension://${id}`, "syncAccount")).toThrow();
    expect(() =>
      enforceExtensionOperation("https://watchtag.vercel.app", "syncAccount"),
    ).not.toThrow();
  });
});
