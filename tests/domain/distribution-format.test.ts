import { describe, expect, it } from "vitest";
import {
  distributionHourScale,
  formatDistributionDate,
  formatDistributionPeriod,
} from "../../src/lib/reports/distribution-format";

describe("distribution chart labels", () => {
  it("matches the compact DEV weekday and month notation", () => {
    expect(formatDistributionDate("2026-09-21", "pt-BR")).toBe("Seg, 21 Set");
    expect(formatDistributionDate("2026-09-26", "pt-BR")).toBe("Sáb, 26 Set");
    expect(formatDistributionDate("2026-10-01", "pt-BR", false)).toBe("01 Out");
  });

  it("matches the DEV weekly period caption", () => {
    expect(
      formatDistributionPeriod({ startDate: "2026-09-21", endDate: "2026-09-27" }, "pt-BR"),
    ).toBe("Semana de 21 a 27 de Setembro");
  });

  it("keeps month and year boundaries unambiguous", () => {
    expect(
      formatDistributionPeriod({ startDate: "2026-10-01", endDate: "2026-10-31" }, "pt-BR"),
    ).toBe("1 a 31 de Outubro");
    expect(
      formatDistributionPeriod({ startDate: "2026-12-28", endDate: "2027-01-03" }, "pt-BR"),
    ).toBe("Semana de 28 de Dezembro de 2026 a 3 de Janeiro de 2027");
    expect(
      formatDistributionPeriod({ startDate: "2026-10-13", endDate: "2026-10-13" }, "pt-BR"),
    ).toBe("13 de Outubro");
  });

  it("retains English localization", () => {
    expect(formatDistributionDate("2026-09-21", "en-US")).toBe("Mon, 21 Sep");
    expect(
      formatDistributionPeriod({ startDate: "2026-09-21", endDate: "2026-09-27" }, "en-US"),
    ).toContain("Week of September");
  });
});

describe("distribution hour scale", () => {
  it("uses the DEV whole-hour intervals", () => {
    expect(distributionHourScale(8 * 3600).ticks.map((value) => value / 3600)).toEqual([
      0, 2, 4, 6, 8, 10, 12,
    ]);
  });

  it.each([0, 1, 43201, 72000, 400000, 10000000])(
    "does not clip a total of %s seconds",
    (total) => {
      const scale = distributionHourScale(total);
      expect(scale.maximum).toBeGreaterThanOrEqual(total);
      expect(scale.ticks.every((value) => Number.isInteger(value / 3600))).toBe(true);
    },
  );
});
