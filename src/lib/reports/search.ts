import { type ReportFilterKey, type ReportFilterValues } from "@/components/report-filters";
import {
  getReportPeriodRange,
  isValidDateOnly,
  type DateRange,
  type ReportPeriodPreset,
} from "@/lib/format";
import { createStoredReportFilters, type StoredReportFilters } from "@/lib/report-filter-storage";
import { reportGroupOptions as groupOptions, type GroupDimension } from "@/lib/report-groups";
import { type ReportView } from "@/lib/report-views";

export type DetailedColumn =
  | "date"
  | "member"
  | "projectClient"
  | "task"
  | "description"
  | "start"
  | "end"
  | "duration"
  | "billability"
  | "hourlyRate"
  | "currency"
  | "value";

export const defaultVisibleFilters: ReportFilterKey[] = ["member", "client", "project"];

export const detailedColumnOptions: Array<{ id: DetailedColumn; label: string }> = [
  { id: "member", label: "Member" },
  { id: "projectClient", label: "Project / client" },
  { id: "task", label: "Task" },
  { id: "description", label: "Description" },
  { id: "date", label: "Date" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "duration", label: "Duration" },
  { id: "billability", label: "Billability" },
  { id: "hourlyRate", label: "Hourly rate" },
  { id: "currency", label: "Currency" },
  { id: "value", label: "Billing" },
];

export const defaultDetailedColumns: DetailedColumn[] = [
  "member",
  "projectClient",
  "task",
  "date",
  "start",
  "end",
  "duration",
  "billability",
  "hourlyRate",
  "currency",
  "value",
];

export type ReportSearch = {
  view?: ReportView;
  preset?: ReportPeriodPreset;
  start?: string;
  end?: string;
  members?: string;
  clients?: string;
  projects?: string;
  description?: string;
  billability?: ReportFilterValues["billability"];
  currency?: ReportFilterValues["currency"];
  visible?: string;
  group?: GroupDimension;
  subgroup?: GroupDimension | "none";
  columns?: string;
  page?: number;
};

export function storedFiltersFromSearch(search: Required<ReportSearch>): StoredReportFilters {
  return createStoredReportFilters({
    preset: search.preset,
    start: search.preset === "custom" ? search.start : "",
    end: search.preset === "custom" ? search.end : "",
    memberIds: parseIds(search.members),
    clientIds: parseIds(search.clients),
    projectIds: parseIds(search.projects),
    description: search.description,
    billability: search.billability,
    currency: search.currency,
    visibleFilters: parseIds(search.visible),
    detailedColumns: parseIds(search.columns),
  });
}

export function searchPatchFromStoredFilters(filters: StoredReportFilters): Partial<ReportSearch> {
  return {
    preset: filters.preset,
    start: filters.start,
    end: filters.end,
    members: encodeIds(filters.memberIds),
    clients: encodeIds(filters.clientIds),
    projects: encodeIds(filters.projectIds),
    description: filters.description,
    billability: filters.billability,
    currency: filters.currency,
    visible: encodeIds(filters.visibleFilters),
    columns: encodeIds(filters.detailedColumns),
  };
}

export function isPeriodPreset(value: unknown): value is ReportPeriodPreset {
  return [
    "today",
    "yesterday",
    "this-week",
    "last-week",
    "last-two-weeks",
    "this-month",
    "last-month",
    "this-year",
    "last-year",
    "custom",
  ].includes(value as ReportPeriodPreset);
}

export function isGroupDimension(value: unknown): value is GroupDimension {
  return groupOptions.some((option) => option.id === value);
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asCsv(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseIds(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function encodeIds(values: string[]): string {
  return values.join(",");
}

export function makeRange(
  preset: ReportPeriodPreset,
  start: string,
  end: string,
  today: string,
  weekStartsOn: 0 | 1,
): DateRange {
  if (preset === "custom" && isValidDateOnly(start) && isValidDateOnly(end)) {
    return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
  }
  return getReportPeriodRange(preset, today, weekStartsOn);
}
