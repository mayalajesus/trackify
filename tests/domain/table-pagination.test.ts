import { describe, expect, it } from "vitest";
import { paginateTable, tablePageLinks } from "../../src/lib/table-pagination";

describe("table pagination", () => {
  const records = Array.from({ length: 23 }, (_, index) => index + 1);

  it("keeps ordering and shows the remaining records on the last page", () => {
    expect(paginateTable(records, 3)).toEqual({
      page: 3,
      totalPages: 3,
      items: [21, 22, 23],
      start: 21,
      end: 23,
      total: 23,
    });
    expect(paginateTable(records, 2).items).toEqual(records.slice(10, 20));
  });

  it("clamps the current page after deletion and handles empty results", () => {
    expect(paginateTable(records.slice(0, 10), 3).page).toBe(1);
    expect(paginateTable([], 3)).toEqual({
      page: 1,
      totalPages: 1,
      items: [],
      start: 0,
      end: 0,
      total: 0,
    });
    expect(paginateTable(records, 0).page).toBe(1);
  });

  it("keeps large page lists compact with accessible boundary pages", () => {
    expect(tablePageLinks(1, 3)).toEqual([1, 2, 3]);
    for (const page of [1, 2, 50, 99, 100]) {
      const links = tablePageLinks(page, 100);
      expect(links).toContain(page);
      expect(links[0]).toBe(1);
      expect(links.at(-1)).toBe(100);
      expect(links.length).toBeLessThanOrEqual(9);
    }
  });
});
