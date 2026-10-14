import { describe, expect, it } from "vitest";
import { groupProjectsByClient } from "../../src/lib/project-groups";
import type { Project } from "../../src/lib/domain";

const project = (id: string, clientId: string): Project => ({
  id,
  clientId,
  name: id,
  status: "active",
  color: "accent",
  billable: false,
  memberIds: [],
  lastActivity: "2026-10-13",
});

describe("tracker project groups", () => {
  it("puts interleaved projects together by client without mutating the source", () => {
    const projects = [project("one", "b"), project("two", "a"), project("three", "b")];
    const groups = groupProjectsByClient(
      projects,
      [
        { id: "a", name: "Árvore", contact: "" },
        { id: "b", name: "Beta", contact: "" },
      ],
      "pt-BR",
      "Cliente desconhecido",
    );
    expect(groups.map((g) => [g.name, g.projects.map((p) => p.id)])).toEqual([
      ["Árvore", ["two"]],
      ["Beta", ["one", "three"]],
    ]);
    expect(projects.map((p) => p.id)).toEqual(["one", "two", "three"]);
    expect(groups[1]!.projects[0]).toBe(projects[0]);
  });

  it("keeps clients with equal names distinct and preserves projects with missing client metadata", () => {
    const groups = groupProjectsByClient(
      [project("one", "a"), project("two", "b"), project("three", "missing")],
      [
        { id: "a", name: "Same", contact: "" },
        { id: "b", name: "Same", contact: "" },
      ],
      "pt-BR",
      "Unknown",
    );
    expect(groups.map((g) => g.id)).toEqual(["a", "b", "missing"]);
    expect(groups[2]!.name).toBe("Unknown");
    expect(groupProjectsByClient([], [], "pt-BR", "Unknown")).toEqual([]);
  });
});
