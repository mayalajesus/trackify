import { expect, it } from "vitest";
import { createRequire } from "node:module";
import writeXlsxFile from "write-excel-file/node";
import { spreadsheetRows } from "../../src/lib/report-export";
import { exportDecimal, exportDuration } from "../../src/lib/reports/export-format";

const { unzipSync, strFromU8 } = createRequire(import.meta.resolve("write-excel-file/node"))(
  "fflate",
) as {
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
  strFromU8: (data: Uint8Array) => string;
};

it("writes numeric Excel durations and decimals with formats usable in sums", async () => {
  const seconds = [5400, 90061, 49, 0];
  const rows = seconds.map((duration) => [
    exportDuration(duration),
    exportDecimal(duration / 3600),
  ]);
  const buffer = await writeXlsxFile([{ sheet: "Report", data: spreadsheetRows(rows) }]).toBuffer();
  const files = unzipSync(new Uint8Array(buffer));
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]!);
  const styles = strFromU8(files["xl/styles.xml"]!);
  for (const [index, duration] of seconds.entries()) {
    for (const [column, value] of [
      ["A", duration / 86400],
      ["B", duration / 3600],
    ] as const) {
      const cell = xml.match(
        new RegExp(`<c\\b[^>]*r="${column}${index + 1}"[^>]*>[\\s\\S]*?</c>`),
      )?.[0];
      expect(cell).toBeDefined();
      expect(cell).not.toMatch(/t="(?:s|str|inlineStr)"/);
      expect(Number(cell!.match(/<v>([^<]+)<\/v>/)?.[1])).toBeCloseTo(value, 12);
    }
  }
  expect(styles).toContain("[h]:mm:ss");
  expect(styles).toContain("0.00");
  expect(rows.reduce((sum, row) => sum + row[1]!.value, 0)).toBeCloseTo(
    seconds.reduce((a, b) => a + b, 0) / 3600,
    12,
  );
});

it("preserves CSV text, seconds precision and formula-injection protection", () => {
  expect(exportDuration(90061).text).toBe("25:01:01");
  expect(exportDecimal(1.5).text).toBe("1.50");
  expect(exportDecimal(49 / 3600).value).toBe(49 / 3600);
  expect(spreadsheetRows([["=SUM(A1:A2)", "Nome, com vírgula", 2]])).toEqual([
    ["'=SUM(A1:A2)", "Nome, com vírgula", 2],
  ]);
});
