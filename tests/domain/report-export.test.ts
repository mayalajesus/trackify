import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  createDetailedReportPdf,
  formatPdfDuration,
  sanitizeSpreadsheetCell,
  type ReportExportPayload,
} from "../../src/lib/report-export";

function payload(entries: NonNullable<ReportExportPayload["pdf"]>["entries"]): ReportExportPayload {
  return {
    title: "trackify-detailed",
    displayTitle: "Detailed report",
    columns: ["Project", "Client", "Task", "User"],
    rows: [],
    locale: "en-US",
    branding: { workspaceName: "QA Trackify", logoDataUrl: null },
    pdf: {
      kind: "detailed",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      totalSeconds: entries.reduce((total, entry) => total + entry.seconds, 0),
      entries,
    },
  };
}

describe("detailed report export", () => {
  it("neutralizes spreadsheet formulas from user-authored cells", () => {
    expect(sanitizeSpreadsheetCell('=HYPERLINK("https://example.test")')).toBe(
      '\'=HYPERLINK("https://example.test")',
    );
    expect(sanitizeSpreadsheetCell("  +SUM(1,1)")).toBe("'  +SUM(1,1)");
    expect(sanitizeSpreadsheetCell("ordinary task")).toBe("ordinary task");
    expect(sanitizeSpreadsheetCell(-15)).toBe(-15);
  });

  it("formats individual and accumulated durations as H:MM", () => {
    expect(formatPdfDuration(0)).toBe("0:00");
    expect(formatPdfDuration(5 * 3600 + 33 * 60)).toBe("5:33");
    expect(formatPdfDuration(150 * 3600 + 16 * 60)).toBe("150:16");
    expect(formatPdfDuration(-1)).toBe("0:00");
  });

  it("renders an A4 multi-page report without vendor branding", async () => {
    const entries = Array.from({ length: 60 }, (_, index) => ({
      date: "2026-07-31",
      task:
        index === 0
          ? "Execução do Processamento e Auditoria da Quarentena e Ajuste no fluxo"
          : "Estudo dos dados e cronograma",
      project: "Code55",
      client: "Ageradora",
      seconds: index === 1 ? 2 * 3600 + 51 * 60 : 5 * 3600 + 33 * 60,
      start: index === 1 ? "23:30" : "14:16",
      end: index === 1 ? "01:30 +1" : "19:49",
      user: "Mayala Jesus",
    }));

    const bytes = await createDetailedReportPdf(payload(entries));
    const pdf = await PDFDocument.load(bytes);
    const firstPage = pdf.getPages()[0]!;

    expect(firstPage.getWidth()).toBeCloseTo(595.28, 1);
    expect(firstPage.getHeight()).toBeCloseTo(841.89, 1);
    expect(pdf.getPages().length).toBeGreaterThan(1);
    expect(new TextDecoder().decode(bytes)).not.toContain("Clockify");
  });

  it("keeps task, project/client and overnight interval data in the PDF payload", () => {
    const report = payload([
      {
        date: "2026-07-31",
        task: "Estudo dos dados e cronograma",
        project: "Code55",
        client: "Ageradora",
        seconds: 5 * 3600 + 33 * 60,
        start: "14:16",
        end: "19:49",
        user: "Mayala Jesus",
      },
      {
        date: "2026-07-30",
        task: "Turno atravessando meia-noite",
        project: "Code55",
        client: "Ageradora",
        seconds: 2 * 3600,
        start: "23:30",
        end: "01:30 +1",
        user: "Mayala Jesus",
      },
    ]);

    expect(report.pdf?.entries).toEqual([
      expect.objectContaining({
        task: "Estudo dos dados e cronograma",
        project: "Code55",
        client: "Ageradora",
        end: "19:49",
      }),
      expect.objectContaining({ end: "01:30 +1" }),
    ]);
    expect(report.pdf?.totalSeconds).toBe(7 * 3600 + 33 * 60);
  });
});
