import { describe, expect, it } from "vitest";
import { sortClientsByName } from "../../src/lib/client-order";

describe("client picker ordering", () => {
  it("sorts Portuguese names ignoring case and accents without changing source data", () => {
    const clients = Object.freeze([
      { id: "z", name: "Zulu" },
      { id: "b", name: "beta" },
      { id: "a", name: "Árvore" },
      { id: "c", name: " Cliente 10 " },
      { id: "d", name: "Cliente 2" },
    ]);
    const sorted = sortClientsByName(clients, "pt-BR");
    expect(sorted.map((client) => client.id)).toEqual(["a", "b", "d", "c", "z"]);
    expect(clients[0]!.id).toBe("z");
    expect(sorted[0]).toBe(clients[2]);
  });

  it("preserves order for equivalent names and accepts an empty list", () => {
    expect(sortClientsByName([], "pt-BR")).toEqual([]);
    const clients = [
      { name: "Ágata", id: "1" },
      { name: "agata", id: "2" },
    ];
    expect(sortClientsByName(clients, "pt-BR")).toEqual(clients);
  });
});
