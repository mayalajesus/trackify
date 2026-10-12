import { describe, expect, it } from "vitest";
import {
  makeRange,
  searchPatchFromStoredFilters,
  storedFiltersFromSearch,
  type ReportSearch,
} from "../../src/lib/reports/search";
import { exportDate, exportTime, endLabel } from "../../src/lib/reports/export-format";

const search: Required<ReportSearch> = {
  view: "detailed",
  preset: "this-month",
  start: "2026-09-01",
  end: "2026-09-30",
  members: "u1,u2",
  clients: "c1",
  projects: "p1",
  description: "Design",
  billability: "all",
  currency: "all",
  visible: "member,client,project",
  group: "project",
  subgroup: "none",
  columns: "task,date",
  page: 2,
};

describe("report page compatibility", () => {
  it("persists relative periods without turning stale dates into a custom range", () => {
    const stored = storedFiltersFromSearch(search);
    expect(stored).toMatchObject({ preset: "this-month", start: "", end: "" });
    expect(makeRange("this-month", search.start, search.end, "2026-10-12", 1)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
  });

  it("restores custom dates and selection ids without replacing view or pagination", () => {
    const patch = searchPatchFromStoredFilters(
      storedFiltersFromSearch({ ...search, preset: "custom" }),
    );
    expect(patch).toMatchObject({
      preset: "custom",
      start: search.start,
      end: search.end,
      members: "u1,u2",
      clients: "c1",
      projects: "p1",
    });
    expect(patch).not.toHaveProperty("view");
    expect(patch).not.toHaveProperty("page");
  });

  it("normalizes reversed custom boundaries without changing the selected dates", () => {
    expect(makeRange("custom", "2026-10-12", "2026-10-01", "2026-10-15", 1)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-12",
    });
  });

  it("keeps export date, time and overnight labels unchanged", () => {
    expect(exportDate("2026-10-12")).toBe("12/10/2026");
    expect(exportTime("09:15")).toBe("09:15:00");
    expect(exportTime("09:15:34")).toBe("09:15:34");
    expect(
      endLabel({
        id: "t1",
        userId: "u1",
        projectId: null,
        task: "Night",
        billable: false,
        date: "2026-10-12",
        start: "23:00",
        end: "01:00",
        endDate: "2026-10-13",
        seconds: 7200,
      }),
    ).toBe("01:00 +1");
  });
});
