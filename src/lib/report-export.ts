import { defaultLocale, translate, type Locale } from "./i18n";

export type ReportExportFormat = "csv" | "xlsx" | "pdf";

export type ReportExportMeta = {
  label: string;
  value: string;
};

export type ReportExportSummaryItem = {
  label: string;
  value: string;
};

export type ReportExportSection = {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
};

export type ReportExportTable = {
  columns: string[];
  rows: Array<Array<string | number>>;
};

export type ReportPdfEntry = {
  date: string;
  task: string;
  project: string;
  client: string;
  seconds: number;
  start: string;
  end: string;
  user: string;
};

export type DetailedReportPdf = {
  kind: "detailed";
  startDate: string;
  endDate: string;
  totalSeconds: number;
  entries: ReportPdfEntry[];
};

export type ReportExportPayload = {
  /** Stable filename stem. */
  title: string;
  /** Human-readable title used by the downloaded report. */
  displayTitle?: string;
  subtitle?: string;
  meta?: ReportExportMeta[];
  summary?: ReportExportSummaryItem[];
  columns: string[];
  rows: Array<Record<string, string | number>>;
  detailedTable?: ReportExportTable;
  sections?: ReportExportSection[];
  pdf?: DetailedReportPdf;
  locale?: Locale;
  branding?: {
    workspaceName: string;
    logoDataUrl: string | null;
  };
};

export type ReportExportResult = { success: true } | { success: false; error: string };

export function sanitizeSpreadsheetCell(value: string | number): string | number {
  if (typeof value !== "string") return value;
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsv(value: string | number): string {
  const text = String(sanitizeSpreadsheetCell(value));
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(payload: ReportExportPayload): ReportExportResult {
  try {
    if (payload.detailedTable) {
      const rows = [payload.detailedTable.columns, ...payload.detailedTable.rows];
      const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`;
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${payload.title}.csv`);
      return { success: true };
    }
    const rows: Array<Array<string | number>> = [];
    if (payload.displayTitle) rows.push([payload.displayTitle]);
    if (payload.subtitle) rows.push([payload.subtitle]);
    for (const item of payload.meta ?? []) rows.push([item.label, item.value]);
    if ((payload.meta?.length ?? 0) > 0) rows.push([]);
    for (const item of payload.summary ?? []) rows.push([item.label, item.value]);
    if ((payload.summary?.length ?? 0) > 0) rows.push([]);
    rows.push(payload.columns);
    rows.push(...payload.rows.map((row) => payload.columns.map((column) => row[column] ?? "")));
    for (const section of payload.sections ?? []) {
      rows.push([], [section.title], section.columns);
      rows.push(...section.rows.map((row) => section.columns.map((column) => row[column] ?? "")));
    }
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${payload.title}.csv`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: translate("The CSV export could not be prepared.", payload.locale),
    };
  }
}

function spreadsheetRows(rows: Array<Array<string | number>>): Array<Array<string | number>> {
  return rows.map((row) => row.map(sanitizeSpreadsheetCell));
}

async function exportXlsx(payload: ReportExportPayload): Promise<ReportExportResult> {
  try {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const sheets: Array<{
      data: Array<Array<string | number>>;
      sheet: string;
      stickyRowsCount?: number;
    }> = [];
    if (payload.detailedTable) {
      sheets.push({
        sheet: "Report",
        stickyRowsCount: 1,
        data: spreadsheetRows([payload.detailedTable.columns, ...payload.detailedTable.rows]),
      });
      downloadBlob(await writeXlsxFile(sheets).toBlob(), `${payload.title}.xlsx`);
      return { success: true };
    }
    const contextRows: Array<Array<string | number>> = [];
    if (payload.displayTitle) contextRows.push([payload.displayTitle]);
    if (payload.subtitle) contextRows.push([payload.subtitle]);
    for (const item of payload.meta ?? []) contextRows.push([item.label, item.value]);
    if ((payload.meta?.length ?? 0) > 0) contextRows.push([]);
    for (const item of payload.summary ?? []) contextRows.push([item.label, item.value]);
    if (contextRows.length > 0) {
      sheets.push({ sheet: "Summary", data: spreadsheetRows(contextRows) });
    }
    sheets.push({
      sheet: "Report",
      stickyRowsCount: 1,
      data: spreadsheetRows([
        payload.columns,
        ...payload.rows.map((row) => payload.columns.map((column) => row[column] ?? "")),
      ]),
    });
    const usedNames = new Set(sheets.map((sheet) => sheet.sheet));
    for (const [index, section] of (payload.sections ?? []).entries()) {
      const baseName =
        section.title
          .replace(/[\\/?*:[\]]/g, " ")
          .trim()
          .slice(0, 31) || `Section ${index + 1}`;
      let sheetName = baseName;
      let suffix = 2;
      while (usedNames.has(sheetName)) {
        const suffixText = ` ${suffix}`;
        sheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
        suffix += 1;
      }
      usedNames.add(sheetName);
      sheets.push({
        sheet: sheetName,
        stickyRowsCount: 1,
        data: spreadsheetRows([
          section.columns,
          ...section.rows.map((row) => section.columns.map((column) => row[column] ?? "")),
        ]),
      });
    }
    downloadBlob(await writeXlsxFile(sheets).toBlob(), `${payload.title}.xlsx`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: translate("The Excel export could not be prepared.", payload.locale),
    };
  }
}

function truncatePdfText(
  value: string | number,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
  maxWidth: number,
): string {
  const text = String(value ?? "—");
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const value = dataUrl.slice(comma + 1);
  const mime = header.match(/^data:([^;]+)/i)?.[1]?.toLowerCase() ?? "";
  if (!header.toLowerCase().includes(";base64") || !value || !mime) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, mime };
  } catch {
    return null;
  }
}

export function formatPdfDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatPdfDate(value: string, locale: Locale): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPdfDateRange(startDate: string, endDate: string, locale: Locale): string {
  return `${formatPdfDate(startDate, locale)} - ${formatPdfDate(endDate, locale)}`;
}

type PdfFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
  heightAtSize: (size: number, options?: { descender?: boolean }) => number;
};

function wrapPdfText(value: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["—"];

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitPdfImage(
  image: { width: number; height: number },
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
}

async function embedWorkspaceLogo(
  pdf: Awaited<ReturnType<typeof import("pdf-lib").PDFDocument.create>>,
  logoDataUrl: string | null | undefined,
) {
  if (!logoDataUrl) return null;
  // Workspace uploads start as data URLs, then loadAccount returns signed
  // Storage URLs. Both representations must be resolved before embedding.
  let logoData = dataUrlBytes(logoDataUrl);
  if (!logoData) {
    const url = new URL(logoDataUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".supabase.co") ||
      !url.pathname.startsWith("/storage/v1/object/sign/workspace-logos/")
    ) {
      throw new Error("Unsupported workspace logo URL.");
    }
    const response = await fetch(url.href, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      // A replacement logo can use the same Storage object path.
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Could not load the workspace logo for the PDF.");
    logoData = {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mime: response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "",
    };
  }
  if (logoData.mime === "image/png") return pdf.embedPng(logoData.bytes);
  if (logoData.mime === "image/jpeg" || logoData.mime === "image/jpg") {
    return pdf.embedJpg(logoData.bytes);
  }
  if (logoData.mime !== "image/webp" || typeof createImageBitmap !== "function") {
    throw new Error("Unsupported workspace logo format for the PDF.");
  }

  const bitmap = await createImageBitmap(
    new Blob([logoData.bytes.buffer as ArrayBuffer], { type: "image/webp" }),
  );
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not convert the workspace logo for the PDF.");
    context.drawImage(bitmap, 0, 0);
    const converted = dataUrlBytes(canvas.toDataURL("image/png"));
    if (!converted) throw new Error("Could not convert the workspace logo for the PDF.");
    return pdf.embedPng(converted.bytes);
  } finally {
    bitmap.close();
  }
}

export async function createDetailedReportPdf(payload: ReportExportPayload): Promise<Uint8Array> {
  const detail = payload.pdf;
  if (!detail || detail.kind !== "detailed") {
    throw new Error("A detailed PDF payload is required.");
  }

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 36;
  const footerY = 22;
  const ink = rgb(0.08, 0.08, 0.09);
  const muted = rgb(0.38, 0.38, 0.4);
  const border = rgb(0.76, 0.76, 0.77);
  const locale = payload.locale ?? defaultLocale;
  const workspaceName = payload.branding?.workspaceName?.trim() || "";
  const logo = await embedWorkspaceLogo(pdf, payload.branding?.logoDataUrl);
  const title = payload.displayTitle ?? translate("Detailed report", locale);
  const pageWidth = pageSize[0];
  const contentWidth = pageWidth - margin * 2;
  const columnWidths = [67, 196, 131, contentWidth - 67 - 196 - 131];
  const columnX = [
    margin,
    margin + columnWidths[0]!,
    margin + columnWidths[0]! + columnWidths[1]!,
    margin + columnWidths[0]! + columnWidths[1]! + columnWidths[2]!,
  ];
  const bodyFontSize = 7.5;
  const secondaryFontSize = 7.3;
  const lineHeight = 12;
  const headerFontSize = 8;
  const headerHeight = 24;
  const minRowHeight = 42;

  const drawLogo = (page: ReturnType<typeof pdf.addPage>) => {
    if (!logo) return;
    const size = fitPdfImage(logo, 56, 28);
    page.drawImage(logo, {
      x: pageWidth - margin - size.width,
      y: pageSize[1] - margin - size.height,
      width: size.width,
      height: size.height,
    });
  };

  const drawFooter = (page: ReturnType<typeof pdf.addPage>, pageNumber: number) => {
    if (workspaceName) {
      page.drawText(workspaceName, {
        x: margin,
        y: footerY,
        size: 7.5,
        font: regular,
        color: muted,
      });
    }
    page.drawText(String(pageNumber), {
      x: pageWidth - margin - 6,
      y: footerY,
      size: 7.5,
      font: regular,
      color: muted,
    });
  };

  const drawFirstPageHeader = (page: ReturnType<typeof pdf.addPage>) => {
    const top = pageSize[1] - margin;
    page.drawText(title, { x: margin, y: top - 13, size: 20, font: regular, color: ink });
    page.drawText(formatPdfDateRange(detail.startDate, detail.endDate, locale), {
      x: margin,
      y: top - 47,
      size: 10,
      font: regular,
      color: muted,
    });
    page.drawText("Total:", { x: margin, y: top - 72, size: 10, font: regular, color: muted });
    page.drawText(formatPdfDuration(detail.totalSeconds), {
      x: margin + 29,
      y: top - 74,
      size: 15,
      font: regular,
      color: ink,
    });
    drawLogo(page);
  };

  const drawTableHeader = (page: ReturnType<typeof pdf.addPage>, top: number) => {
    const labels = [
      translate("Date", locale),
      translate("Description", locale),
      translate("Duration", locale),
      translate("User", locale),
    ];
    labels.forEach((label, index) => {
      page.drawText(label, {
        x: columnX[index]!,
        y: top - 9,
        size: headerFontSize,
        font: regular,
        color: muted,
      });
    });
    page.drawLine({
      start: { x: margin, y: top - headerHeight },
      end: { x: pageWidth - margin, y: top - headerHeight },
      thickness: 0.6,
      color: border,
    });
    return top - headerHeight;
  };

  const drawEntry = (page: ReturnType<typeof pdf.addPage>, entry: ReportPdfEntry, top: number) => {
    const descriptionLines = wrapPdfText(entry.task, regular, bodyFontSize, columnWidths[1]! - 8);
    const projectClient = [entry.project, entry.client].filter(Boolean).join(" - ");
    const projectLines = wrapPdfText(
      projectClient,
      regular,
      secondaryFontSize,
      columnWidths[1]! - 8,
    );
    const durationLines = [formatPdfDuration(entry.seconds), `${entry.start} - ${entry.end}`];
    const rowLines = Math.max(
      descriptionLines.length + Math.max(projectLines.length, 1),
      durationLines.length,
      2,
    );
    const rowHeight = Math.max(minRowHeight, rowLines * lineHeight + 12);
    const primaryY = top - 16;

    page.drawText(formatPdfDate(entry.date, locale), {
      x: columnX[0]!,
      y: primaryY,
      size: bodyFontSize,
      font: regular,
      color: ink,
    });
    descriptionLines.forEach((line, index) => {
      page.drawText(line, {
        x: columnX[1]!,
        y: primaryY - index * lineHeight,
        size: bodyFontSize,
        font: regular,
        color: ink,
      });
    });
    projectLines.forEach((line, index) => {
      page.drawText(line, {
        x: columnX[1]!,
        y: primaryY - (descriptionLines.length + index) * lineHeight,
        size: secondaryFontSize,
        font: regular,
        color: muted,
      });
    });
    page.drawText(durationLines[0]!, {
      x: columnX[2]!,
      y: primaryY,
      size: bodyFontSize,
      font: regular,
      color: ink,
    });
    page.drawText(durationLines[1]!, {
      x: columnX[2]!,
      y: primaryY - lineHeight,
      size: secondaryFontSize,
      font: regular,
      color: muted,
    });
    page.drawText(entry.user || "—", {
      x: columnX[3]!,
      y: primaryY,
      size: bodyFontSize,
      font: regular,
      color: ink,
    });
    page.drawLine({
      start: { x: margin, y: top - rowHeight },
      end: { x: pageWidth - margin, y: top - rowHeight },
      thickness: 0.6,
      color: border,
    });
    return rowHeight;
  };

  let page = pdf.addPage(pageSize);
  let pageNumber = 1;
  drawFirstPageHeader(page);
  let currentY = drawTableHeader(page, pageSize[1] - 174);
  for (const entry of detail.entries) {
    const descriptionLineCount = wrapPdfText(
      entry.task,
      regular,
      bodyFontSize,
      columnWidths[1]! - 8,
    ).length;
    const projectLineCount = wrapPdfText(
      [entry.project, entry.client].filter(Boolean).join(" - "),
      regular,
      secondaryFontSize,
      columnWidths[1]! - 8,
    ).length;
    const rowHeight = Math.max(
      minRowHeight,
      Math.max(descriptionLineCount + 1, projectLineCount + descriptionLineCount, 2) * lineHeight +
        12,
    );
    if (currentY - rowHeight < footerY + 16) {
      drawFooter(page, pageNumber);
      page = pdf.addPage(pageSize);
      pageNumber += 1;
      currentY = pageSize[1] - margin - 8;
    }
    currentY -= drawEntry(page, entry, currentY);
  }
  drawFooter(page, pageNumber);

  pdf.setTitle(title);
  pdf.setAuthor(workspaceName || "Trackify");
  pdf.setSubject(translate("Detailed report", locale));
  return Uint8Array.from(await pdf.save());
}

async function exportPdf(payload: ReportExportPayload): Promise<ReportExportResult> {
  try {
    if (payload.pdf?.kind === "detailed") {
      const bytes = await createDetailedReportPdf(payload);
      downloadBlob(
        new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
        `${payload.title}.pdf`,
      );
      return { success: true };
    }
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [841.89, 595.28];
    const margin = 34;
    const ink = rgb(0.09, 0.12, 0.17);
    const muted = rgb(0.38, 0.43, 0.5);
    const accent = rgb(0.05, 0.55, 0.94);
    const border = rgb(0.82, 0.85, 0.89);
    const soft = rgb(0.96, 0.97, 0.98);
    const title = payload.displayTitle ?? "Time report";
    const workspaceName = payload.branding?.workspaceName?.trim() || "Trackify";
    const generatedAt = new Intl.DateTimeFormat(payload.locale ?? defaultLocale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    pdf.setTitle(title);
    pdf.setAuthor(workspaceName);
    pdf.setSubject(payload.subtitle ?? "Time report");

    const logo = await embedWorkspaceLogo(pdf, payload.branding?.logoDataUrl);

    const drawHeader = (page: ReturnType<typeof pdf.addPage>, pageNumber: number) => {
      const { width, height } = page.getSize();
      if (logo) {
        page.drawImage(logo, { x: margin, y: height - margin - 26, width: 26, height: 26 });
      } else {
        page.drawRectangle({
          x: margin,
          y: height - margin - 26,
          width: 26,
          height: 26,
          color: accent,
        });
        page.drawText("TB", {
          x: margin + 5,
          y: height - margin - 18,
          size: 9,
          font: bold,
          color: rgb(1, 1, 1),
        });
      }
      page.drawText(workspaceName, {
        x: margin + 36,
        y: height - margin - 17,
        size: 12,
        font: bold,
        color: accent,
      });
      page.drawText(title, {
        x: margin,
        y: height - margin - 55,
        size: 21,
        font: bold,
        color: ink,
      });
      page.drawText(payload.subtitle ?? "Trackify · filtered report", {
        x: margin,
        y: height - margin - 73,
        size: 9,
        font: regular,
        color: muted,
      });
      page.drawText(`${translate("Generated", payload.locale)} ${generatedAt}`, {
        x: width - margin - 180,
        y: height - margin - 17,
        size: 8,
        font: regular,
        color: muted,
      });
      page.drawLine({
        start: { x: margin, y: height - margin - 86 },
        end: { x: width - margin, y: height - margin - 86 },
        thickness: 1.2,
        color: ink,
      });
      page.drawText(`${translate("Page", payload.locale)} ${pageNumber}`, {
        x: width - margin - 45,
        y: 18,
        size: 8,
        font: regular,
        color: muted,
      });
    };

    const drawContext = (page: ReturnType<typeof pdf.addPage>) => {
      const { width, height } = page.getSize();
      let y = height - margin - 104;
      for (const item of payload.meta ?? []) {
        const label = `${item.label}:`;
        const value = truncatePdfText(item.value, regular, 8, width - margin * 2 - 120);
        page.drawText(label, { x: margin, y, size: 8, font: bold, color: muted });
        page.drawText(value, { x: margin + 54, y, size: 8, font: regular, color: ink });
        y -= 13;
      }
      const summary = payload.summary ?? [{ label: "Records", value: String(payload.rows.length) }];
      const boxGap = 8;
      const boxWidth = (width - margin * 2 - boxGap * (summary.length - 1)) / summary.length;
      const boxY = y - 38;
      summary.forEach((item, index) => {
        const x = margin + index * (boxWidth + boxGap);
        page.drawRectangle({
          x,
          y: boxY,
          width: boxWidth,
          height: 32,
          color: soft,
          borderColor: border,
          borderWidth: 0.7,
        });
        page.drawText(item.label.toUpperCase(), {
          x: x + 8,
          y: boxY + 19,
          size: 7,
          font: bold,
          color: muted,
        });
        page.drawText(truncatePdfText(item.value, bold, 12, boxWidth - 16), {
          x: x + 8,
          y: boxY + 7,
          size: 12,
          font: bold,
          color: ink,
        });
      });
      return boxY - 20;
    };

    const columns = payload.columns.length ? payload.columns : ["Details"];
    const rows = payload.rows.length
      ? payload.rows
      : [{ [columns[0]!]: translate("No records match the selected report.", payload.locale) }];
    const weights = columns.map((column) => {
      const sample = rows
        .slice(0, 20)
        .reduce((size, row) => Math.max(size, String(row[column] ?? "").length), column.length);
      return Math.min(2.4, Math.max(0.65, sample / 15));
    });
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const tableWidth = pageSize[0] - margin * 2;
    const widths = weights.map((weight) => (tableWidth * weight) / weightTotal);
    const rowHeight = 20;
    const headerHeight = 22;
    const fontSize = columns.length > 9 ? 6.2 : columns.length > 7 ? 6.8 : 7.4;
    let page = pdf.addPage(pageSize);
    let pageNumber = 1;
    drawHeader(page, pageNumber);
    const tableTop = drawContext(page);
    let currentY = tableTop;
    let rowIndex = 0;
    const drawTableHeader = () => {
      let x = margin;
      page.drawRectangle({
        x: margin,
        y: currentY - headerHeight,
        width: tableWidth,
        height: headerHeight,
        color: rgb(0.91, 0.94, 0.97),
        borderColor: border,
        borderWidth: 0.7,
      });
      columns.forEach((column, index) => {
        page.drawText(truncatePdfText(column, bold, fontSize, widths[index]! - 10), {
          x: x + 5,
          y: currentY - 15,
          size: fontSize,
          font: bold,
          color: muted,
        });
        x += widths[index]!;
      });
      currentY -= headerHeight;
    };
    drawTableHeader();
    while (rowIndex < rows.length) {
      if (currentY - rowHeight < 34) {
        pageNumber += 1;
        page = pdf.addPage(pageSize);
        drawHeader(page, pageNumber);
        currentY = pageSize[1] - margin - 104;
        drawTableHeader();
      }
      const row = rows[rowIndex]!;
      let x = margin;
      if (rowIndex % 2 === 1)
        page.drawRectangle({
          x: margin,
          y: currentY - rowHeight,
          width: tableWidth,
          height: rowHeight,
          color: rgb(0.985, 0.99, 0.995),
        });
      columns.forEach((column, index) => {
        const value = row[column] ?? "—";
        page.drawText(truncatePdfText(value, regular, fontSize, widths[index]! - 10), {
          x: x + 5,
          y: currentY - 14,
          size: fontSize,
          font: regular,
          color: ink,
        });
        page.drawLine({
          start: { x, y: currentY },
          end: { x: x + widths[index]!, y: currentY },
          thickness: 0.45,
          color: border,
        });
        x += widths[index]!;
      });
      page.drawLine({
        start: { x: margin, y: currentY - rowHeight },
        end: { x: margin + tableWidth, y: currentY - rowHeight },
        thickness: 0.45,
        color: border,
      });
      currentY -= rowHeight;
      rowIndex += 1;
    }
    for (const section of payload.sections ?? []) {
      const sectionColumns = section.columns.length ? section.columns : ["Details"];
      const sectionRows = section.rows.length
        ? section.rows
        : [
            {
              [sectionColumns[0]!]: translate(
                "No records match the selected report.",
                payload.locale,
              ),
            },
          ];
      const sectionWeights = sectionColumns.map((column) => {
        const sample = sectionRows
          .slice(0, 20)
          .reduce((size, row) => Math.max(size, String(row[column] ?? "").length), column.length);
        return Math.min(2.4, Math.max(0.65, sample / 15));
      });
      const sectionWeightTotal = sectionWeights.reduce((sum, weight) => sum + weight, 0);
      const sectionWidths = sectionWeights.map(
        (weight) => (tableWidth * weight) / sectionWeightTotal,
      );
      const sectionFontSize =
        sectionColumns.length > 9 ? 6.2 : sectionColumns.length > 7 ? 6.8 : 7.4;

      if (currentY - headerHeight - rowHeight - 30 < 34) {
        pageNumber += 1;
        page = pdf.addPage(pageSize);
        drawHeader(page, pageNumber);
        currentY = pageSize[1] - margin - 104;
      } else {
        currentY -= 20;
      }
      page.drawText(section.title, {
        x: margin,
        y: currentY,
        size: 11,
        font: bold,
        color: ink,
      });
      currentY -= 12;

      const drawSectionHeader = () => {
        let x = margin;
        page.drawRectangle({
          x: margin,
          y: currentY - headerHeight,
          width: tableWidth,
          height: headerHeight,
          color: rgb(0.91, 0.94, 0.97),
          borderColor: border,
          borderWidth: 0.7,
        });
        sectionColumns.forEach((column, index) => {
          page.drawText(
            truncatePdfText(column, bold, sectionFontSize, sectionWidths[index]! - 10),
            {
              x: x + 5,
              y: currentY - 15,
              size: sectionFontSize,
              font: bold,
              color: muted,
            },
          );
          x += sectionWidths[index]!;
        });
        currentY -= headerHeight;
      };

      drawSectionHeader();
      for (const [sectionRowIndex, sectionRow] of sectionRows.entries()) {
        if (currentY - rowHeight < 34) {
          pageNumber += 1;
          page = pdf.addPage(pageSize);
          drawHeader(page, pageNumber);
          currentY = pageSize[1] - margin - 104;
          drawSectionHeader();
        }
        let x = margin;
        if (sectionRowIndex % 2 === 1) {
          page.drawRectangle({
            x: margin,
            y: currentY - rowHeight,
            width: tableWidth,
            height: rowHeight,
            color: rgb(0.985, 0.99, 0.995),
          });
        }
        sectionColumns.forEach((column, index) => {
          const value = sectionRow[column] ?? "—";
          page.drawText(
            truncatePdfText(value, regular, sectionFontSize, sectionWidths[index]! - 10),
            {
              x: x + 5,
              y: currentY - 14,
              size: sectionFontSize,
              font: regular,
              color: ink,
            },
          );
          page.drawLine({
            start: { x, y: currentY },
            end: { x: x + sectionWidths[index]!, y: currentY },
            thickness: 0.45,
            color: border,
          });
          x += sectionWidths[index]!;
        });
        page.drawLine({
          start: { x: margin, y: currentY - rowHeight },
          end: { x: margin + tableWidth, y: currentY - rowHeight },
          thickness: 0.45,
          color: border,
        });
        currentY -= rowHeight;
      }
    }
    page.drawText(
      `${workspaceName} · ${payload.rows.length} ${translate("records", payload.locale)}`,
      { x: margin, y: 18, size: 8, font: regular, color: muted },
    );
    const bytes = await pdf.save();
    const downloadableBytes = Uint8Array.from(bytes);
    downloadBlob(
      new Blob([downloadableBytes.buffer as ArrayBuffer], { type: "application/pdf" }),
      `${payload.title}.pdf`,
    );
    return { success: true };
  } catch {
    return {
      success: false,
      error: translate("The PDF export could not be prepared.", payload.locale),
    };
  }
}

export async function exportReport(
  format: ReportExportFormat,
  payload: ReportExportPayload,
): Promise<ReportExportResult> {
  if (format === "csv") return exportCsv(payload);
  if (format === "xlsx") return exportXlsx(payload);
  return exportPdf(payload);
}
