import { describe, expect, it } from "vitest";
import {
  defaultProjectColor,
  projectColorOptions,
  projectColorValue,
} from "../../src/lib/project-colors";

describe("project colors", () => {
  it("provides a stable selectable palette with sky as the default", () => {
    expect(projectColorOptions).toHaveLength(8);
    expect(defaultProjectColor).toBe("#019ed4");
  });

  it("normalizes stored colors and legacy project tokens", () => {
    expect(projectColorValue("#ABCDEF")).toBe("#abcdef");
    expect(projectColorValue("bg-warning")).toBe("#f3d77c");
    expect(projectColorValue("unknown")).toBe(defaultProjectColor);
  });
});
