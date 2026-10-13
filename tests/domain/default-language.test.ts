import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("default language", () => {
  it("starts in Portuguese even when the browser prefers English", async () => {
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    const { defaultLocale, translate } = await import("../../src/lib/i18n");
    const { initialPreferences } = await import("../../src/lib/store/defaults");
    expect(defaultLocale).toBe("pt-BR");
    expect(initialPreferences.language).toBe("pt-BR");
    expect(translate("Sign in")).toBe("Entrar");
    expect(translate("Sign in", "en-US")).toBe("Sign in");
  });
});
