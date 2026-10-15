import { describe, expect, it } from "vitest";
import {
  defaultProjectColor,
  projectColorOptions,
  projectColorValue,
  projectColorTextValue,
} from "../../src/lib/project-colors";

describe("project colors", () => {
  it("uses black as the only project color", () => {
    expect(projectColorOptions).toHaveLength(1);
    expect(defaultProjectColor).toBe("#000000");
  });

  it("normalizes stored colors and legacy project tokens", () => {
    expect(projectColorValue("#ABCDEF")).toBe("#000000");
    expect(projectColorValue("bg-warning")).toBe("#000000");
    expect(projectColorValue("unknown")).toBe(defaultProjectColor);
    expect(projectColorValue(null)).toBe(defaultProjectColor);
    expect(projectColorValue(undefined)).toBe(defaultProjectColor);
  });

  it("keeps project names readable in both themes", () => {
    expect(projectColorTextValue("#ABCDEF")).toBe("var(--foreground)");
  });
});
