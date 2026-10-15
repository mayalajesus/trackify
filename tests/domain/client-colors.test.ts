import { describe, expect, it } from "vitest";
import { clientColorValue, isClientColor, clientColorOptions } from "../../src/lib/client-colors";
import { isValidClient } from "../../src/lib/store/validation";

describe("client colors", () => {
  it("retains the reference palette and accepts custom opaque hex colors", () => {
    expect(clientColorOptions).toHaveLength(8);
    expect(clientColorValue("#ABCDEF")).toBe("#abcdef");
    expect(clientColorOptions.every((option) => isClientColor(option.value))).toBe(true);
  });
  it.each([undefined, null, "", "red", "#fff", "#12345678", "url(evil)"])(
    "handles legacy or invalid color %s",
    (value) => {
      expect(isClientColor(value)).toBe(false);
      expect(clientColorValue(value)).toBe("#000000");
    },
  );
  it("loads old client snapshots but rejects malformed supplied colors", () => {
    const client = { id: "c1", name: "Client", contact: "" };
    expect(isValidClient(client)).toBe(true);
    expect(isValidClient({ ...client, color: "#123456" })).toBe(true);
    expect(isValidClient({ ...client, color: "red" })).toBe(false);
  });
});
