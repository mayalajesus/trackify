import { describe, expect, it } from "vitest";
import { reportExportFilename } from "../../src/lib/reports/export-filename";

const base = {
  memberIds: ["maria"],
  memberMap: new Map([["maria", { name: "Maria Silva" }]]),
  workspaceName: "Equipe Code55",
  view: "detailed" as const,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
};

describe("report export filenames", () => {
  it("uses the effective single-member scope and the complete selected period", () => {
    expect(reportExportFilename(base)).toBe(
      "Maria Silva - Relatório detalhado - 01-10-2026 a 31-10-2026",
    );
  });
  it.each([[], ["maria", "other"]])("uses the workspace for team filters %j", (...ids) => {
    expect(reportExportFilename({ ...base, memberIds: ids })).toBe(
      "Equipe Code55 - Relatório detalhado - 01-10-2026 a 31-10-2026",
    );
  });
  it("prints a single date once and identifies overview exports", () => {
    expect(reportExportFilename({ ...base, endDate: base.startDate, view: "overview" })).toBe(
      "Maria Silva - Relatório geral - 01-10-2026",
    );
  });
  it("keeps calendar dates across month and year boundaries", () => {
    expect(
      reportExportFilename({ ...base, startDate: "2026-12-31", endDate: "2027-01-02" }),
    ).toContain("31-12-2026 a 02-01-2027");
  });
  it("preserves accents and removes unsafe filename characters", () => {
    expect(
      reportExportFilename({
        ...base,
        memberMap: new Map([["maria", { name: '  João / Ação: <Equipe> | "A"?*\\\n. ' }]]),
      }),
    ).toBe("João Ação Equipe A - Relatório detalhado - 01-10-2026 a 31-10-2026");
  });
  it("falls back to workspace then Trackify when a member name is unavailable", () => {
    expect(reportExportFilename({ ...base, memberMap: new Map() })).toMatch(/^Equipe Code55 -/);
    expect(reportExportFilename({ ...base, memberMap: new Map(), workspaceName: " /:* " })).toMatch(
      /^Trackify -/,
    );
  });
  it("localizes the report label without changing the date boundaries", () => {
    expect(reportExportFilename({ ...base, locale: "en-US" })).toBe(
      "Maria Silva - Detailed report - 01-10-2026 to 31-10-2026",
    );
  });
});
