import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectionMessage,
  networkErrorMessage,
  offlineMessage,
} from "../../src/lib/network-errors";
import { translate } from "../../src/lib/i18n";

afterEach(() => vi.unstubAllGlobals());

describe("connection feedback", () => {
  it.each([
    "Failed to fetch",
    "TypeError: Failed to fetch",
    "fetch failed",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ])("explains %s without claiming the user is offline", (message) => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(networkErrorMessage(message)).toBe(connectionMessage);
    expect(translate(message, "pt-BR")).toContain("Não foi possível conectar ao servidor");
  });
  it("explains confirmed offline failures", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(networkErrorMessage("Failed to fetch")).toBe(offlineMessage);
    expect(translate("Failed to fetch", "pt-BR")).toBe(
      "Você está sem conexão com a internet. Reconecte-se e tente novamente.",
    );
  });
  it("preserves permission and validation errors even while offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(networkErrorMessage("You do not have access to this workspace.")).toBe(
      "You do not have access to this workspace.",
    );
    expect(networkErrorMessage("A task is required.")).toBe("A task is required.");
  });
});
