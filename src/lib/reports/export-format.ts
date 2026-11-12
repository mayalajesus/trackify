import type { TimeEntry } from "@/lib/domain";
import type { ReportExportNumericCell } from "@/lib/report-export";
import { formatClock } from "@/lib/format";
import { getEndDateForEntry, getEntryEndDayOffset } from "@/lib/format";
import { type ReportView } from "@/lib/report-views";

export function exportDuration(seconds: number): ReportExportNumericCell {
  const duration = Math.max(0, seconds);
  return { value: duration / 86400, format: "[h]:mm:ss", text: formatClock(duration) };
}

export function exportDecimal(value: number): ReportExportNumericCell {
  return { value, format: "0.00", text: value.toFixed(2) };
}

export function endLabel(entry: TimeEntry): string {
  const offset = getEntryEndDayOffset(entry);
  return `${entry.end}${offset > 0 ? ` +${offset}` : ""}`;
}

export function exportDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function exportTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

export function getReportExportView(): ReportView {
  return "detailed";
}

export function compareEntries(a: TimeEntry, b: TimeEntry): number {
  return (
    b.date.localeCompare(a.date) ||
    b.start.localeCompare(a.start) ||
    getEndDateForEntry(b).localeCompare(getEndDateForEntry(a)) ||
    b.end.localeCompare(a.end) ||
    b.id.localeCompare(a.id)
  );
}
