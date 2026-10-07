import { describe, expect, it } from "vitest";
import {
  constrainReportFiltersToScope,
  createReportFilterStorageKey,
  createStoredReportFilters,
  hasExplicitReportFilterParams,
  parseStoredReportFilters,
  readStoredReportFilters,
  resolveInitialReportFilters,
  writeStoredReportFilters,
} from "../../src/lib/report-filter-storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("report filter storage", () => {
  it("scopes saved filters by workspace and user", () => {
    expect(createReportFilterStorageKey("workspace:one", "user/one")).toBe(
      "trackify:report-filters:v1:workspace%3Aone:user%2Fone",
    );
  });

  it("does not treat the default report URL as an explicit filter", () => {
    expect(
      hasExplicitReportFilterParams(
        "?view=overview&preset=this-month&members=&clients=&projects=&billability=all&currency=all",
      ),
    ).toBe(false);
    expect(hasExplicitReportFilterParams("?view=overview&members=u1")).toBe(true);
    expect(hasExplicitReportFilterParams("?view=overview&preset=last-month")).toBe(true);
  });

  it("round-trips an intentionally empty team selection", () => {
    const storage = memoryStorage();
    const key = createReportFilterStorageKey("w1", "u1");
    const filters = createStoredReportFilters({
      preset: "this-month",
      start: "",
      end: "",
      memberIds: [],
      clientIds: ["c1"],
      projectIds: [],
      description: "review",
      billability: "billable",
      currency: "BRL",
      visibleFilters: ["member", "project"],
    });

    expect(writeStoredReportFilters(storage, key, filters)).toBe(true);
    expect(readStoredReportFilters(storage, key)).toEqual(filters);
  });

  it("round-trips every persisted filter and a custom period", () => {
    const storage = memoryStorage();
    const key = createReportFilterStorageKey("w1", "u1");
    const filters = createStoredReportFilters({
      preset: "custom",
      start: "2026-08-01",
      end: "2026-08-21",
      memberIds: ["u1", "u2"],
      clientIds: ["c1", "c2"],
      projectIds: ["p1", "none"],
      description: "design review",
      billability: "internal",
      currency: "BRL",
      visibleFilters: ["member", "client", "project", "description", "billability"],
      detailedColumns: ["date", "projectClient", "description", "duration"],
    });

    expect(writeStoredReportFilters(storage, key, filters)).toBe(true);
    expect(readStoredReportFilters(storage, key)).toEqual(filters);
  });

  it("opens on the current user when there are no saved or explicit filters", () => {
    const currentFilters = createStoredReportFilters({
      preset: "this-month",
      start: "",
      end: "",
      memberIds: [],
      clientIds: [],
      projectIds: [],
      description: "",
      billability: "all",
      currency: "all",
      visibleFilters: ["member", "client", "project", "billability"],
    });

    expect(
      resolveInitialReportFilters({
        currentFilters,
        savedFilters: null,
        currentUserId: "u1",
        hasExplicitFilters: false,
      }).memberIds,
    ).toEqual(["u1"]);
  });

  it("keeps saved preferences authoritative when the page reloads with route filters", () => {
    const currentFilters = createStoredReportFilters({
      preset: "this-month",
      start: "",
      end: "",
      memberIds: ["u1"],
      clientIds: [],
      projectIds: [],
      description: "",
      billability: "all",
      currency: "all",
      visibleFilters: ["member", "client", "project", "billability"],
    });
    const savedFilters = createStoredReportFilters({
      ...currentFilters,
      clientIds: ["c1"],
      projectIds: ["p1"],
      billability: "billable",
    });

    expect(
      resolveInitialReportFilters({
        currentFilters,
        savedFilters,
        currentUserId: "u1",
        hasExplicitFilters: true,
      }),
    ).toEqual(savedFilters);
  });

  it("always constrains members to their own report data", () => {
    const filters = createStoredReportFilters({
      preset: "this-month",
      start: "",
      end: "",
      memberIds: ["u2"],
      clientIds: ["c1", "outside-client"],
      projectIds: ["p1", "outside-project"],
      description: "review",
      billability: "all",
      currency: "all",
      visibleFilters: ["member", "project", "unknown"],
      detailedColumns: ["date", "duration", "unknown"],
    });

    expect(
      constrainReportFiltersToScope(filters, {
        currentUserId: "u1",
        canViewTeam: false,
        memberIds: ["u1", "u2"],
        clientIds: ["c1"],
        projectIds: ["p1"],
        visibleFilters: ["member", "client", "project", "description", "billability"],
        detailedColumns: ["date", "duration"],
      }),
    ).toMatchObject({
      memberIds: ["u1"],
      clientIds: ["c1"],
      projectIds: ["p1"],
      visibleFilters: ["member", "project"],
      detailedColumns: ["date", "duration"],
    });
  });

  it("preserves an admin's saved all-team selection", () => {
    const filters = createStoredReportFilters({
      preset: "this-month",
      start: "",
      end: "",
      memberIds: [],
      clientIds: [],
      projectIds: [],
      description: "",
      billability: "all",
      currency: "all",
      visibleFilters: ["member"],
    });

    expect(
      constrainReportFiltersToScope(filters, {
        currentUserId: "owner",
        canViewTeam: true,
        memberIds: ["owner", "u1"],
        clientIds: [],
        projectIds: [],
        visibleFilters: ["member"],
        detailedColumns: ["date"],
      }).memberIds,
    ).toEqual([]);
  });

  it("ignores corrupt data and invalid custom periods", () => {
    expect(parseStoredReportFilters("not-json")).toBeNull();
    expect(
      parseStoredReportFilters(
        JSON.stringify({
          version: 1,
          preset: "custom",
          start: "invalid",
          end: "2026-08-31",
          memberIds: ["u1"],
        }),
      ),
    ).toMatchObject({ preset: "this-month", start: "", end: "", memberIds: ["u1"] });
  });

  it("keeps reports usable when browser storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };
    const key = createReportFilterStorageKey("w1", "u1");
    const filters = createStoredReportFilters({
      preset: "this-month",
      start: "",
      end: "",
      memberIds: ["u1"],
      clientIds: [],
      projectIds: [],
      description: "",
      billability: "all",
      currency: "all",
      visibleFilters: ["member"],
    });

    expect(readStoredReportFilters(storage, key)).toBeNull();
    expect(writeStoredReportFilters(storage, key, filters)).toBe(false);
  });
});
