import { Button } from "@heroui/react/button";
import { Badge } from "@heroui/react/badge";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Checkbox } from "@heroui/react/checkbox";
import { Label } from "@heroui/react/label";
import { Popover } from "@heroui/react/popover";
import { ProgressBar } from "@heroui/react/progress-bar";
import { Table } from "@heroui/react/table";
import { Tabs } from "@heroui/react/tabs";
import { Tooltip } from "@heroui/react/tooltip";
import { Typography } from "@heroui/react/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRotateLeft,
  ArrowUp,
  CircleInfo,
  Minus,
} from "@gravity-ui/icons";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label as ChartLabel,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { BillableIndicator } from "@/components/billable-indicator";
import { ProjectLabel } from "@/components/project-color";
import { DataTable } from "@/components/data-table";
import { ExportModal } from "@/components/export-modal";
import {
  ReportFiltersBar,
  type ReportFilterKey,
  type ReportFilterValues,
} from "@/components/report-filters";
import { PageHeader } from "@/components/page-header";
import { ErrorBlock, CardsSkeleton } from "@/components/states";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  ReportChart,
  ReportChartWidget,
  ReportKpi,
  ReportTableWidget,
  ReportWidget,
  reportChartAxisProps,
  reportChartColors,
  reportChartTooltipProps,
  reportVerticalBarProps,
  shortenReportChartLabel,
} from "@/components/report-widget";
import type { Client, Member, Project, TimeEntry } from "@/lib/domain";
import { createApiDataSource } from "@/lib/api-data-source";
import {
  formatDate,
  formatDateRange,
  formatClock,
  formatDuration,
  getDayOffset,
  getEndDateForEntry,
  getEntryEndDayOffset,
  getMonthBounds,
  getReportPeriodRange,
  getYearBounds,
  isValidDateOnly,
  normalizeSearch,
  shiftDate,
  type DateRange,
  type ReportPeriodPreset,
} from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ReportExportPayload, ReportPdfEntry } from "@/lib/report-export";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import {
  billableValue,
  billingForEntry,
  currencyOptions,
  formatMoney,
  formatMoneyTotals,
  isCurrencyCode,
  sumBillableValues,
  type BillingPreference,
} from "@/lib/billing";
import {
  calculateReportAnalytics,
  getReportBillableCurrencies,
  getPreviousEquivalentPeriod,
  type ReportAnalytics,
  type ShiftId,
  type TemporalBucket,
} from "@/lib/report-analytics";
import { entriesForReportWindow, reportEntriesQueryKey } from "@/lib/report-query";
import { isLegacyTeamReportView, normalizeReportView, type ReportView } from "@/lib/report-views";
import {
  constrainReportFiltersToScope,
  createReportFilterStorageKey,
  createStoredReportFilters,
  hasExplicitReportFilterParams,
  parseStoredReportFiltersValue,
  readStoredReportFilters,
  resolveInitialReportFilters,
  writeStoredReportFilters,
  type StoredReportFilters,
} from "@/lib/report-filter-storage";
import {
  buildReportGroups,
  clientNameFor,
  nameForMember,
  projectFor,
  projectNameFor,
  reportGroupOptions as groupOptions,
  type GroupDimension,
} from "@/lib/report-groups";
type DetailedColumn =
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

const defaultVisibleFilters: ReportFilterKey[] = ["member", "client", "project", "billability"];

const detailedColumnOptions: Array<{ id: DetailedColumn; label: string }> = [
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

const defaultDetailedColumns: DetailedColumn[] = [
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

type ReportSearch = {
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

function storedFiltersFromSearch(search: Required<ReportSearch>): StoredReportFilters {
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

function searchPatchFromStoredFilters(filters: StoredReportFilters): Partial<ReportSearch> {
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

function isPeriodPreset(value: unknown): value is ReportPeriodPreset {
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

function isGroupDimension(value: unknown): value is GroupDimension {
  return groupOptions.some((option) => option.id === value);
}

function isDetailedColumn(value: string): value is DetailedColumn {
  return detailedColumnOptions.some((column) => column.id === value);
}

function parseDetailedColumns(value: string): DetailedColumn[] {
  const columns = value.split(",").filter(isDetailedColumn);
  return columns.length > 0 ? [...new Set(columns)] : defaultDetailedColumns;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asCsv(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseIds(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function encodeIds(values: string[]): string {
  return values.join(",");
}

function makeRange(
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

function endLabel(entry: TimeEntry): string {
  const offset = getEntryEndDayOffset(entry);
  return `${entry.end}${offset > 0 ? ` +${offset}` : ""}`;
}

function exportDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function exportTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

function getReportExportView(): ReportView {
  return "detailed";
}

function compareEntries(a: TimeEntry, b: TimeEntry): number {
  return (
    b.date.localeCompare(a.date) ||
    b.start.localeCompare(a.start) ||
    getEndDateForEntry(b).localeCompare(getEndDateForEntry(a)) ||
    b.end.localeCompare(a.end) ||
    b.id.localeCompare(a.id)
  );
}

export const Route = createFileRoute("/reports")({
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    view: normalizeReportView(search["view"]),
    preset: isPeriodPreset(search["preset"]) ? search["preset"] : "this-month",
    start: asText(search["start"]),
    end: asText(search["end"]),
    members: asCsv(search["members"]),
    clients: asCsv(search["clients"]),
    projects: asCsv(search["projects"]),
    description: asText(search["description"]),
    billability:
      search["billability"] === "billable" || search["billability"] === "internal"
        ? search["billability"]
        : "all",
    currency:
      search["currency"] === "all" || isCurrencyCode(search["currency"])
        ? search["currency"]
        : "all",
    visible:
      typeof search["visible"] === "string" ? search["visible"] : defaultVisibleFilters.join(","),
    group: isLegacyTeamReportView(search["view"])
      ? "member"
      : isGroupDimension(search["group"])
        ? search["group"]
        : "project",
    subgroup:
      search["subgroup"] === "none" || isGroupDimension(search["subgroup"])
        ? search["subgroup"]
        : "none",
    columns: asCsv(search["columns"]),
    page:
      Number.isInteger(search["page"]) && Number(search["page"]) > 0 ? Number(search["page"]) : 1,
  }),
  head: () => ({
    meta: [
      { title: "Reports — Trackify" },
      {
        name: "description",
        content: "Overview and detailed time reports.",
      },
      { property: "og:title", content: "Reports — Trackify" },
      { property: "og:description", content: "Filter and understand tracked time." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const rawSearch = Route.useSearch();
  const search = useMemo<Required<ReportSearch>>(
    () => ({
      view: rawSearch.view ?? "detailed",
      preset: rawSearch.preset ?? "this-month",
      start: rawSearch.start ?? "",
      end: rawSearch.end ?? "",
      members: rawSearch.members ?? "",
      clients: rawSearch.clients ?? "",
      projects: rawSearch.projects ?? "",
      description: rawSearch.description ?? "",
      billability: rawSearch.billability ?? "all",
      currency: rawSearch.currency ?? "all",
      visible: rawSearch.visible ?? defaultVisibleFilters.join(","),
      group: rawSearch.group ?? "project",
      subgroup: rawSearch.subgroup ?? "none",
      columns: rawSearch.columns ?? defaultDetailedColumns.join(","),
      page: rawSearch.page ?? 1,
    }),
    [rawSearch],
  );
  const navigate = Route.useNavigate();
  const {
    entries,
    projects,
    clients,
    members,
    currentUserId,
    currentWorkspace,
    accountLoading,
    can,
    settings,
    preferences,
    setUserPreferences,
    workspaceBilling,
    billingPreferencesByUserId,
    today,
  } = useStore();
  const { locale, t, error } = useI18n();
  const reportDataSource = useMemo(() => createApiDataSource(), []);
  const [exportOpen, setExportOpen] = useState(false);
  const workspaceId = currentWorkspace?.id ?? "";

  const weekStartsOn = settings.weekStart === "sunday" ? 0 : 1;
  const range = useMemo(
    () => makeRange(search.preset, search.start, search.end, today, weekStartsOn),
    [search.end, search.preset, search.start, today, weekStartsOn],
  );
  const previousRange = useMemo(() => getPreviousEquivalentPeriod(range), [range]);
  const reportWindow = useMemo(
    () => ({
      startDate:
        previousRange.startDate < range.startDate ? previousRange.startDate : range.startDate,
      endDate: previousRange.endDate > range.endDate ? previousRange.endDate : range.endDate,
    }),
    [previousRange.endDate, previousRange.startDate, range.endDate, range.startDate],
  );
  const showTeam = can("view-all-reports");
  const effectiveGroup: GroupDimension =
    !showTeam && search.group === "member" ? "project" : search.group;
  const effectiveSubgroup: GroupDimension | "none" =
    !showTeam && search.subgroup === "member" ? "none" : search.subgroup;
  const filterValues = useMemo<ReportFilterValues>(
    () => ({
      memberIds: showTeam ? parseIds(search.members) : [currentUserId],
      clientIds: parseIds(search.clients),
      projectIds: parseIds(search.projects),
      description: search.description,
      billability: search.billability,
      currency: search.currency,
    }),
    [
      search.billability,
      search.clients,
      search.currency,
      search.description,
      search.members,
      search.projects,
      currentUserId,
      showTeam,
    ],
  );
  const visibleFilters = parseIds(search.visible).filter((key): key is ReportFilterKey =>
    ["member", "client", "project", "description", "billability"].includes(key),
  );
  const storedFilters = useMemo(() => storedFiltersFromSearch(search), [search]);
  const filterStorageKey = useMemo(
    () =>
      workspaceId && currentUserId ? createReportFilterStorageKey(workspaceId, currentUserId) : "",
    [currentUserId, workspaceId],
  );
  const [hydratedFilterStorageKey, setHydratedFilterStorageKey] = useState<string | null>(null);
  const filterPreferencesReady =
    Boolean(filterStorageKey) && hydratedFilterStorageKey === filterStorageKey;

  const constrainFiltersToCurrentScope = useCallback(
    (filters: StoredReportFilters) =>
      constrainReportFiltersToScope(filters, {
        currentUserId,
        canViewTeam: showTeam,
        memberIds: members
          .filter((member) => member.status === "active")
          .map((member) => member.id),
        clientIds: clients.map((client) => client.id),
        projectIds: projects.map((project) => project.id),
        visibleFilters: ["member", "client", "project", "description", "billability"],
        detailedColumns: detailedColumnOptions.map((column) => column.id),
      }),
    [clients, currentUserId, members, projects, showTeam],
  );

  const updateSearch = (patch: Partial<ReportSearch>) => {
    const nextSearch: Required<ReportSearch> = {
      ...search,
      ...patch,
      page: patch.page ?? 1,
    };

    if (workspaceId && hydratedFilterStorageKey === filterStorageKey) {
      const nextFilters = constrainFiltersToCurrentScope(storedFiltersFromSearch(nextSearch));
      if (typeof window !== "undefined") {
        writeStoredReportFilters(window.localStorage, filterStorageKey, nextFilters);
      }
      if (JSON.stringify(preferences.reportFilters[workspaceId]) !== JSON.stringify(nextFilters)) {
        setUserPreferences({
          reportFilters: { ...preferences.reportFilters, [workspaceId]: nextFilters },
        });
      }
    }

    navigate({
      search: nextSearch,
      replace: true,
      resetScroll: false,
    });
  };

  useEffect(() => {
    if (
      accountLoading ||
      !filterStorageKey ||
      !currentUserId ||
      hydratedFilterStorageKey === filterStorageKey ||
      typeof window === "undefined"
    ) {
      return;
    }

    const savedFilters =
      readStoredReportFilters(window.localStorage, filterStorageKey) ??
      parseStoredReportFiltersValue(preferences.reportFilters[workspaceId]);
    const explicitFilters = hasExplicitReportFilterParams(window.location.search);
    const selectedFilters = resolveInitialReportFilters({
      currentFilters: storedFilters,
      savedFilters,
      currentUserId,
      hasExplicitFilters: explicitFilters,
    });
    const normalizedFilters = constrainFiltersToCurrentScope(selectedFilters);
    const patch = searchPatchFromStoredFilters(normalizedFilters);
    const shouldNavigate =
      search.preset !== normalizedFilters.preset ||
      search.start !== normalizedFilters.start ||
      search.end !== normalizedFilters.end ||
      search.members !== encodeIds(normalizedFilters.memberIds) ||
      search.clients !== encodeIds(normalizedFilters.clientIds) ||
      search.projects !== encodeIds(normalizedFilters.projectIds) ||
      search.description !== normalizedFilters.description ||
      search.billability !== normalizedFilters.billability ||
      search.currency !== normalizedFilters.currency ||
      search.visible !== encodeIds(normalizedFilters.visibleFilters) ||
      search.columns !== encodeIds(normalizedFilters.detailedColumns);

    if (shouldNavigate) {
      // Let the URL become the source of truth before persisting the hydrated filters.
      // Updating preferences here would render again with the old URL and restart hydration.
      void navigate({
        search: { ...search, ...patch, page: 1 },
        replace: true,
        resetScroll: false,
      });
      return;
    }

    if (
      JSON.stringify(preferences.reportFilters[workspaceId]) !== JSON.stringify(normalizedFilters)
    ) {
      setUserPreferences({
        reportFilters: { ...preferences.reportFilters, [workspaceId]: normalizedFilters },
      });
    }
    setHydratedFilterStorageKey(filterStorageKey);
  }, [
    accountLoading,
    constrainFiltersToCurrentScope,
    currentUserId,
    filterStorageKey,
    hydratedFilterStorageKey,
    navigate,
    preferences.reportFilters,
    search,
    setUserPreferences,
    storedFilters,
    workspaceId,
  ]);

  useEffect(() => {
    if (!filterStorageKey || hydratedFilterStorageKey !== filterStorageKey) {
      return;
    }

    const normalizedFilters = constrainFiltersToCurrentScope(storedFilters);
    if (typeof window !== "undefined") {
      writeStoredReportFilters(window.localStorage, filterStorageKey, normalizedFilters);
    }
    if (
      JSON.stringify(preferences.reportFilters[workspaceId]) === JSON.stringify(normalizedFilters)
    ) {
      return;
    }
    setUserPreferences({
      reportFilters: { ...preferences.reportFilters, [workspaceId]: normalizedFilters },
    });
  }, [
    constrainFiltersToCurrentScope,
    filterStorageKey,
    hydratedFilterStorageKey,
    preferences.reportFilters,
    setUserPreferences,
    storedFilters,
    workspaceId,
  ]);

  const updatePeriod = (preset: ReportPeriodPreset, nextRange: DateRange) => {
    updateSearch({
      preset,
      start: nextRange.startDate,
      end: nextRange.endDate,
    });
  };

  const shiftReportPeriod = (direction: -1 | 1) => {
    const preset = search.preset;
    let nextRange: DateRange;

    if (preset === "this-month" || preset === "last-month") {
      const anchor = shiftDate(range.startDate, direction === 1 ? 31 : -1);
      nextRange = getMonthBounds(anchor);
    } else if (preset === "this-year" || preset === "last-year") {
      const anchor = shiftDate(range.startDate, direction === 1 ? 366 : -1);
      nextRange = getYearBounds(anchor);
    } else {
      const periodLength =
        preset === "today" || preset === "yesterday"
          ? 1
          : preset === "last-two-weeks"
            ? 14
            : preset === "this-week" || preset === "last-week"
              ? 7
              : getDayOffset(range.startDate, range.endDate) + 1;

      nextRange = {
        startDate: shiftDate(range.startDate, direction * periodLength),
        endDate: shiftDate(range.endDate, direction * periodLength),
      };
    }

    updateSearch({
      preset: "custom",
      start: nextRange.startDate,
      end: nextRange.endDate,
    });
  };

  const scopedEntries = useMemo(
    () => (showTeam ? entries : entries.filter((entry) => entry.userId === currentUserId)),
    [currentUserId, entries, showTeam],
  );
  const localReportEntries = useMemo(
    () => entriesForReportWindow(scopedEntries, reportWindow.startDate, reportWindow.endDate),
    [reportWindow.endDate, reportWindow.startDate, scopedEntries],
  );
  const reportQuery = useQuery({
    queryKey: reportEntriesQueryKey(
      workspaceId,
      currentUserId,
      reportWindow.startDate,
      reportWindow.endDate,
    ),
    enabled: Boolean(workspaceId && currentUserId && filterPreferencesReady),
    queryFn: async () => {
      const result = await reportDataSource.loadReportEntries(currentUserId, {
        workspaceId,
        startDate: reportWindow.startDate,
        endDate: reportWindow.endDate,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    placeholderData: localReportEntries,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    // Returning to a range already present in the cache should be instant. The
    // interval still refreshes an open report without duplicating navigation calls.
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const reportEntries = reportQuery.data ?? localReportEntries;
  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const fallbackForEntry = useCallback(
    (entry: TimeEntry): BillingPreference =>
      billingPreferencesByUserId[entry.userId] ?? {
        hourlyRate: workspaceBilling.hourlyRate,
        currency: workspaceBilling.currency,
      },
    [billingPreferencesByUserId, workspaceBilling.currency, workspaceBilling.hourlyRate],
  );
  const normalizedDescription = normalizeSearch(filterValues.description);

  const reportEntriesBeforeCurrency = useMemo(() => {
    const selectedMemberIds = new Set(filterValues.memberIds);
    const selectedClientIds = new Set(filterValues.clientIds);
    const selectedProjectIds = new Set(filterValues.projectIds);
    return reportEntries
      .filter((entry) => selectedMemberIds.size === 0 || selectedMemberIds.has(entry.userId))
      .filter((entry) => {
        if (selectedClientIds.size === 0) return true;
        const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;
        return Boolean(project && selectedClientIds.has(project.clientId));
      })
      .filter(
        (entry) =>
          selectedProjectIds.size === 0 || selectedProjectIds.has(entry.projectId ?? "none"),
      )
      .filter(
        (entry) =>
          !normalizedDescription ||
          normalizeSearch(entry.description ?? "").includes(normalizedDescription),
      )
      .filter(
        (entry) =>
          filterValues.billability === "all" ||
          (filterValues.billability === "billable" ? entry.billable : !entry.billable),
      );
  }, [filterValues, normalizedDescription, projectMap, reportEntries]);
  const availableCurrencies = useMemo(
    () =>
      getReportBillableCurrencies(reportEntriesBeforeCurrency, {
        range,
        fallbackForEntry,
        timeZone: preferences.timezone,
      }),
    [fallbackForEntry, preferences.timezone, range, reportEntriesBeforeCurrency],
  );
  const currencyFilteredEntries = useMemo(
    () =>
      filterValues.currency === "all"
        ? reportEntriesBeforeCurrency
        : reportEntriesBeforeCurrency.filter(
            (entry) =>
              entry.billable &&
              billingForEntry(entry, fallbackForEntry(entry)).currency === filterValues.currency,
          ),
    [fallbackForEntry, filterValues.currency, reportEntriesBeforeCurrency],
  );
  const filteredEntries = useMemo(
    () =>
      currencyFilteredEntries
        .filter((entry) => entry.date >= range.startDate && entry.date <= range.endDate)
        .sort(compareEntries),
    [currencyFilteredEntries, range.endDate, range.startDate],
  );

  const { total, billable, internal } = useMemo(() => {
    const total = filteredEntries.reduce((sum, entry) => sum + entry.seconds, 0);
    const billable = filteredEntries
      .filter((entry) => entry.billable)
      .reduce((sum, entry) => sum + entry.seconds, 0);
    return { total, billable, internal: total - billable };
  }, [filteredEntries]);
  const reportAnalytics = useMemo(
    () =>
      calculateReportAnalytics({
        entries: currencyFilteredEntries,
        range,
        projects,
        clients,
        fallbackForEntry,
        emptyCurrency:
          filterValues.currency === "all" ? workspaceBilling.currency : filterValues.currency,
        timeZone: preferences.timezone,
        weekStartsOn,
      }),
    [
      clients,
      fallbackForEntry,
      filterValues.currency,
      workspaceBilling.currency,
      preferences.timezone,
      projects,
      range,
      currencyFilteredEntries,
      weekStartsOn,
    ],
  );
  const billableValues = sumBillableValues(
    filteredEntries,
    fallbackForEntry,
    filterValues.currency === "all" ? workspaceBilling.currency : filterValues.currency,
  );
  const exportView = getReportExportView();
  const exportUsesAnalytics = exportView === "overview";
  const exportTotal = exportUsesAnalytics ? reportAnalytics.summary.totalSeconds : total;
  const exportBillable = exportUsesAnalytics ? reportAnalytics.summary.billableSeconds : billable;
  const exportInternal = exportUsesAnalytics ? reportAnalytics.summary.internalSeconds : internal;
  const exportRecords = exportUsesAnalytics
    ? reportAnalytics.summary.entryCount
    : filteredEntries.length;
  const exportBillableValues = exportUsesAnalytics
    ? reportAnalytics.summary.billableValueByCurrency
    : billableValues;
  const reportScope = can("export-all-reports") ? t("Workspace report") : t("Your report");
  const groups = useMemo(
    () =>
      buildReportGroups(
        filteredEntries,
        effectiveGroup,
        effectiveSubgroup,
        members,
        projects,
        clients,
        locale,
        fallbackForEntry,
      ),
    [
      clients,
      fallbackForEntry,
      filteredEntries,
      members,
      projects,
      locale,
      effectiveGroup,
      effectiveSubgroup,
    ],
  );
  const exportContext = useMemo(() => {
    const viewLabel = t(exportView === "detailed" ? "Detailed" : "Overview");
    const grouping = exportView === "detailed" ? t("None") : t("Time");
    return {
      locale,
      ...(currentWorkspace
        ? {
            branding: {
              workspaceName: currentWorkspace.name,
              logoDataUrl: currentWorkspace.logoDataUrl,
            },
          }
        : {}),
      displayTitle: t("Detailed report"),
      subtitle: `Trackify · ${formatDateRange(range.startDate, range.endDate, locale)}`,
      meta: [
        { label: t("Period"), value: formatDateRange(range.startDate, range.endDate, locale) },
        { label: t("Scope"), value: reportScope },
        { label: t("View"), value: viewLabel },
        { label: t("Grouping"), value: grouping },
        {
          label: t("Filters"),
          value:
            [
              search.members
                ? t("{count} team members", { count: parseIds(search.members).length })
                : "",
              search.clients
                ? t("{count} clients", { count: parseIds(search.clients).length })
                : "",
              search.projects
                ? t("{count} projects", { count: parseIds(search.projects).length })
                : "",
              search.description ? `${t("Description")}: ${search.description}` : "",
              search.billability !== "all" ? t(search.billability) : "",
              search.currency !== "all" ? `${t("Currency")}: ${search.currency}` : "",
            ]
              .filter(Boolean)
              .join(" · ") || t("None"),
        },
      ],
      summary: [
        { label: t("Entries"), value: String(exportRecords) },
        { label: t("Tracked"), value: formatDuration(exportTotal, locale) },
        { label: t("Billable"), value: formatDuration(exportBillable, locale) },
        { label: t("Internal"), value: formatDuration(exportInternal, locale) },
        ...currencyOptions
          .filter((currency) => exportBillableValues[currency] !== undefined)
          .map((currency) => ({
            label: `${t("Estimated billable value")} (${currency})`,
            value: formatMoney(exportBillableValues[currency] ?? 0, currency, locale),
          })),
      ],
    };
  }, [
    currentWorkspace,
    exportBillable,
    exportBillableValues,
    exportInternal,
    exportRecords,
    exportTotal,
    locale,
    range.endDate,
    range.startDate,
    reportScope,
    exportView,
    search.billability,
    search.clients,
    search.currency,
    search.description,
    search.members,
    search.projects,
    t,
  ]);

  const exportPayload = useMemo<ReportExportPayload>(() => {
    if (exportView === "overview") {
      const summary = reportAnalytics.summary;
      const exportedProjects = overviewProjectRows(reportAnalytics, projects, clients);
      const evolution = overviewEvolutionRows(reportAnalytics, locale);
      const hasPreviousActivity = reportAnalytics.comparison.previous.totalSeconds > 0;
      const activityTime = overviewActivityTime(reportAnalytics);
      const exportPercentageFormatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      });
      const consistencyPercentage = overviewConsistencyPercentage(reportAnalytics);
      const weekdayRows = overviewWeekdayRows(reportAnalytics, locale);
      return {
        ...exportContext,
        title: `trackify-${exportView}`,
        columns: [t("Metric"), t("Value")],
        rows: [
          {
            [t("Metric")]: t("Activity time"),
            [t("Value")]: `${exportPercentageFormatter.format(
              activityTime.percentage,
            )}% (${formatDuration(summary.totalSeconds, locale)} / ${formatDuration(
              activityTime.periodSeconds,
              locale,
            )})`,
          },
          {
            [t("Metric")]: t("Tracked"),
            [t("Value")]: formatDuration(summary.totalSeconds, locale),
          },
          {
            [t("Metric")]: t("Billable"),
            [t("Value")]: formatDuration(summary.billableSeconds, locale),
          },
          {
            [t("Metric")]: t("Internal"),
            [t("Value")]: formatDuration(summary.internalSeconds, locale),
          },
          { [t("Metric")]: t("Active days"), [t("Value")]: summary.activeDays },
          {
            [t("Metric")]: t("Average/day"),
            [t("Value")]: formatDuration(summary.averageSecondsPerActiveDay, locale),
          },
          { [t("Metric")]: t("Projects"), [t("Value")]: summary.projectCount },
          { [t("Metric")]: t("Tasks"), [t("Value")]: summary.taskCount },
          ...currencyOptions
            .filter((currency) => summary.billableValueByCurrency[currency] !== undefined)
            .map((currency) => ({
              [t("Metric")]: `${t("Estimated billable value")} (${currency})`,
              [t("Value")]: formatMoney(
                summary.billableValueByCurrency[currency] ?? 0,
                currency,
                locale,
              ),
            })),
        ],
        sections: [
          {
            title: t("Activity evolution"),
            columns: [
              t("Period"),
              t("Tracked"),
              ...(hasPreviousActivity ? [t("Previous period"), t("Difference")] : []),
            ],
            rows: evolution.map((bucket) => {
              const difference = bucket.difference;
              const differencePrefix = difference > 0 ? "+" : difference < 0 ? "−" : "";
              return {
                [t("Period")]: bucket.label,
                [t("Tracked")]: formatDuration(bucket.currentTotal, locale),
                ...(hasPreviousActivity
                  ? {
                      [t("Previous period")]: formatDuration(bucket.previous, locale),
                      [t("Difference")]: `${differencePrefix}${formatDuration(
                        Math.abs(difference),
                        locale,
                      )}`,
                    }
                  : {}),
              };
            }),
          },
          {
            title: t("Time composition"),
            columns: [t("Billing"), t("Tracked"), t("Share")],
            rows: [
              {
                [t("Billing")]: t("Billable"),
                [t("Tracked")]: formatDuration(summary.billableSeconds, locale),
                [t("Share")]: `${Math.round(summary.billablePercentage)}%`,
              },
              {
                [t("Billing")]: t("Internal"),
                [t("Tracked")]: formatDuration(summary.internalSeconds, locale),
                [t("Share")]: summary.totalSeconds
                  ? `${Math.round((summary.internalSeconds / summary.totalSeconds) * 100)}%`
                  : "0%",
              },
            ],
          },
          {
            title: t("Hours by shift"),
            columns: [t("Shift"), t("Tracked"), t("Share")],
            rows: reportAnalytics.shifts.map((shift) => ({
              [t("Shift")]: t(shiftLabels[shift.shift]),
              [t("Tracked")]: formatDuration(shift.seconds, locale),
              [t("Share")]: summary.totalSeconds
                ? `${Math.round((shift.seconds / summary.totalSeconds) * 100)}%`
                : "0%",
            })),
          },
          {
            title: t("Top projects"),
            columns: [
              t("Project"),
              t("Client"),
              t("Tracked"),
              t("Share"),
              t("Estimated billable value"),
            ],
            rows: exportedProjects.map((project) => ({
              [t("Project")]: project.id === "none" ? t("No project") : project.project,
              [t("Client")]: project.client ?? t("No client"),
              [t("Tracked")]: formatDuration(project.seconds, locale),
              [t("Share")]: `${Math.round(project.percentage)}%`,
              [t("Estimated billable value")]:
                formatMoneyTotals(project.valueByCurrency, locale) || "—",
            })),
          },
          {
            title: t("Work rhythm"),
            columns: [t("Metric"), t("Value")],
            rows: [
              {
                [t("Metric")]: t("Average session"),
                [t("Value")]: formatDuration(summary.averageEntryDurationSeconds, locale),
              },
              {
                [t("Metric")]: t("Longest session"),
                [t("Value")]: formatDuration(summary.longestEntryDurationSeconds, locale),
              },
              {
                [t("Metric")]: t("Consistency"),
                [t("Value")]: `${Math.round(consistencyPercentage)}%`,
              },
              {
                [t("Metric")]: t("Peak day"),
                [t("Value")]: summary.busiestDay
                  ? `${formatDate(summary.busiestDay.id, locale)} · ${formatDuration(
                      summary.busiestDay.seconds,
                      locale,
                    )}`
                  : "—",
              },
            ],
          },
          {
            title: t("Activity by weekday"),
            columns: [t("Day"), t("Tracked")],
            rows: weekdayRows.map((weekday) => ({
              [t("Day")]: weekday.fullLabel,
              [t("Tracked")]: formatDuration(weekday.seconds, locale),
            })),
          },
        ],
      };
    }
    if (exportView === "detailed") {
      const exportCurrency =
        filterValues.currency === "all" ? workspaceBilling.currency : filterValues.currency;
      const detailedTableColumns =
        locale === "pt-BR"
          ? [
              "Projeto",
              "Cliente",
              "Descrição",
              "Tarefa",
              "Usuário",
              "Grupo",
              "E-mail",
              "Etiqueta",
              "Faturável",
              "Data de início",
              "Hora de início",
              "Data final",
              "Hora de término",
              "Duração (h)",
              "Duração (decimal)",
              `Valor faturável (${exportCurrency})`,
              `Valor Faturável (${exportCurrency})`,
            ]
          : [
              "Project",
              "Client",
              "Description",
              "Task",
              "User",
              "Group",
              "Email",
              "Tag",
              "Billable",
              "Start Date",
              "Start Time",
              "End Date",
              "End Time",
              "Duration (h)",
              "Duration (decimal)",
              `Billable Rate (${exportCurrency})`,
              `Billable Amount (${exportCurrency})`,
            ];
      const columns = [
        t("Project"),
        t("Client"),
        t("Task"),
        t("User"),
        t("Email"),
        t("Description"),
        t("Billability"),
        t("Start date"),
        t("Start time"),
        t("End date"),
        t("End time"),
        t("Duration"),
        t("Hourly rate"),
        t("Currency"),
        t("Estimated billable value"),
      ];
      return {
        ...exportContext,
        title: `trackify-${exportView}`,
        pdf: {
          kind: "detailed",
          startDate: range.startDate,
          endDate: range.endDate,
          totalSeconds: exportTotal,
          entries: filteredEntries.map((entry): ReportPdfEntry => {
            const member = memberMap.get(entry.userId);
            return {
              date: entry.date,
              task: entry.task,
              project: projectNameFor(projects, entry.projectId),
              client: clientNameFor(clients, projects, entry.projectId),
              seconds: entry.seconds,
              start: entry.start,
              end: endLabel(entry),
              user: member?.name ?? t("Unknown member"),
            };
          }),
        },
        detailedTable: {
          columns: detailedTableColumns,
          rows: filteredEntries.map((entry) => {
            const member = memberMap.get(entry.userId);
            const project = entry.projectId ? projectNameFor(projects, entry.projectId) : "";
            const client = entry.projectId ? clientNameFor(clients, projects, entry.projectId) : "";
            const endDate = getEndDateForEntry(entry);
            const billing = billingForEntry(entry, fallbackForEntry(entry));
            return [
              project,
              client,
              entry.description ?? "",
              entry.task,
              member?.name ?? t("Unknown member"),
              "",
              member?.email ?? "",
              "",
              entry.billable
                ? locale === "pt-BR"
                  ? "Sim"
                  : "Yes"
                : locale === "pt-BR"
                  ? "Não"
                  : "No",
              exportDate(entry.date),
              exportTime(entry.start),
              exportDate(endDate),
              exportTime(entry.end),
              formatClock(Math.max(0, entry.seconds)),
              (Math.max(0, entry.seconds) / 3600).toFixed(2),
              billing.hourlyRate.toFixed(2),
              billableValue(entry, billing).toFixed(2),
            ];
          }),
        },
        columns,
        rows: filteredEntries.map((entry) => {
          const member = memberMap.get(entry.userId);
          const endDate = getEndDateForEntry(entry);
          const billing = billingForEntry(entry, fallbackForEntry(entry));
          return {
            [t("Project")]: projectNameFor(projects, entry.projectId),
            [t("Client")]: clientNameFor(clients, projects, entry.projectId),
            [t("Task")]: entry.task,
            [t("User")]: member?.name ?? t("Unknown member"),
            [t("Email")]: member?.email ?? "",
            [t("Description")]: entry.description ?? "",
            [t("Billability")]: entry.billable ? t("Billable") : t("Internal"),
            [t("Start date")]: formatDate(entry.date, locale),
            [t("Start time")]: entry.start,
            [t("End date")]: formatDate(endDate, locale),
            [t("End time")]: endLabel(entry),
            [t("Duration")]: formatDuration(entry.seconds, locale),
            [t("Hourly rate")]: formatMoney(billing.hourlyRate, billing.currency, locale),
            [t("Currency")]: billing.currency,
            [t("Estimated billable value")]: formatMoney(
              billableValue(entry, billing),
              billing.currency,
              locale,
            ),
          };
        }),
      };
    }
    {
      const hasSubgroup = effectiveSubgroup !== "none" && effectiveSubgroup !== effectiveGroup;
      const exportGroups = hasSubgroup
        ? groups.flatMap((group) =>
            (group.children ?? []).map((child) => ({
              primaryLabel: group.label,
              secondaryLabel: child.label,
              group: child,
            })),
          )
        : groups.map((group) => ({ primaryLabel: group.label, secondaryLabel: "", group }));
      return {
        ...exportContext,
        title: `trackify-${exportView}`,
        columns: [
          t("Group"),
          ...(hasSubgroup ? [t("Subgroup")] : []),
          t("Tracked"),
          t("Share"),
          t("Billable"),
          t("Internal"),
          t("Billable percentage"),
          t("Estimated billable value"),
          t("Records"),
          t("Average entry duration"),
        ],
        rows: exportGroups.map((item) => ({
          [t("Group")]: item.primaryLabel,
          ...(hasSubgroup ? { [t("Subgroup")]: item.secondaryLabel } : {}),
          [t("Tracked")]: formatDuration(item.group.seconds, locale),
          [t("Share")]: total ? `${Math.round((item.group.seconds / total) * 100)}%` : "0%",
          [t("Billable")]: formatDuration(item.group.billable, locale),
          [t("Internal")]: formatDuration(item.group.seconds - item.group.billable, locale),
          [t("Billable percentage")]: item.group.seconds
            ? `${Math.round((item.group.billable / item.group.seconds) * 100)}%`
            : "0%",
          [t("Estimated billable value")]: formatMoneyTotals(item.group.billableValue, locale),
          [t("Records")]: item.group.records,
          [t("Average entry duration")]: formatDuration(
            item.group.records ? item.group.seconds / item.group.records : 0,
            locale,
          ),
        })),
      };
    }
  }, [
    clients,
    effectiveGroup,
    effectiveSubgroup,
    exportTotal,
    filteredEntries,
    filterValues.currency,
    groups,
    memberMap,
    projects,
    workspaceBilling.currency,
    exportContext,
    exportView,
    locale,
    reportAnalytics,
    range.endDate,
    range.startDate,
    t,
    total,
    fallbackForEntry,
  ]);

  const description = {
    overview: t("See tracked time, billability, estimated value and activity distribution."),
    detailed: t("Inspect every entry with its project, client, person and billability."),
  }[search.view];

  const clearFilters = () =>
    updateSearch({
      members: "",
      clients: "",
      projects: "",
      description: "",
      billability: "all",
      currency: "all",
    });
  const reportInitialLoading =
    !filterPreferencesReady ||
    (reportQuery.isPending && !reportQuery.data && !localReportEntries.length);
  const reportError =
    filterPreferencesReady && reportQuery.error
      ? error(
          reportQuery.error instanceof Error
            ? reportQuery.error.message
            : "The data request failed.",
        )
      : null;

  return (
    <div className={search.view === "overview" ? "space-y-5" : "space-y-6"}>
      <PageHeader
        title={t("Reports")}
        description={description}
        actions={
          <div className="flex items-center gap-2">
            <ReportViewSwitcher value={search.view} onChange={(view) => updateSearch({ view })} />
            <ReportExportButton onPress={() => setExportOpen(true)} />
          </div>
        }
      />

      {filterPreferencesReady ? (
        <ReportFiltersBar
          preset={search.preset}
          range={range}
          today={today}
          weekStartsOn={weekStartsOn}
          values={filterValues}
          visibleFilters={visibleFilters}
          members={members}
          clients={clients}
          projects={projects}
          currencies={availableCurrencies}
          showTeam={showTeam}
          weeklyNavigation
          onPeriodChange={updatePeriod}
          onPeriodShift={shiftReportPeriod}
          onChange={(patch) => {
            const next = { ...filterValues, ...patch };
            updateSearch({
              members: encodeIds(next.memberIds),
              clients: encodeIds(next.clientIds),
              projects: encodeIds(next.projectIds),
              description: next.description,
              billability: next.billability,
              currency: next.currency,
            });
          }}
          onClear={() =>
            updateSearch({
              members: "",
              clients: "",
              projects: "",
              description: "",
              billability: "all",
              currency: "all",
            })
          }
        />
      ) : null}

      {reportError ? (
        <ErrorBlock
          title={t("We couldn't refresh this report")}
          description={reportError}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : null}
      {filterPreferencesReady && reportQuery.isFetching && !reportInitialLoading ? (
        <div className="sr-only" role="status" aria-live="polite">
          {t("Refreshing report")}
        </div>
      ) : null}
      {reportInitialLoading ? (
        <CardsSkeleton count={3} />
      ) : (
        <>
          {search.view === "overview" ? (
            <OverviewDashboard analytics={reportAnalytics} projects={projects} clients={clients} />
          ) : (
            <DetailedReport
              entries={filteredEntries}
              onClear={clearFilters}
              members={members}
              projects={projects}
              clients={clients}
              columns={parseDetailedColumns(search.columns)}
              onChangeColumns={(columns) => updateSearch({ columns: encodeIds(columns) })}
              fallbackForEntry={fallbackForEntry}
            />
          )}
        </>
      )}

      <ExportModal
        isOpen={exportOpen}
        onOpenChange={setExportOpen}
        scope={reportScope}
        payload={exportPayload}
      />
    </div>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

const shiftLabels: Record<ShiftId, string> = {
  overnight: "Overnight",
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};

const shiftEmoji: Record<ShiftId, string> = {
  overnight: "🦇",
  morning: "☀️",
  afternoon: "🌤️",
  night: "🌑",
};

function formatOverviewBucket(
  bucket: Pick<TemporalBucket, "startDate" | "endDate" | "granularity">,
  locale: Locale,
): string {
  const start = new Date(`${bucket.startDate}T12:00:00`);
  const end = new Date(`${bucket.endDate}T12:00:00`);
  const dayMonthFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
  });
  if (bucket.granularity === "day") return dayMonthFormatter.format(start);
  if (bucket.granularity === "week") {
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      const dayFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit" });
      const monthFormatter = new Intl.DateTimeFormat(locale, { month: "2-digit" });
      return `${dayFormatter.format(start)}–${dayFormatter.format(end)}/${monthFormatter.format(
        end,
      )}`;
    }
    return `${dayMonthFormatter.format(start)}–${dayMonthFormatter.format(end)}`;
  }
  return new Intl.DateTimeFormat(locale, { month: "2-digit", year: "2-digit" }).format(start);
}

function formatOverviewAxisBucket(
  bucket: Pick<TemporalBucket, "startDate" | "endDate" | "granularity">,
  locale: Locale,
): string {
  const start = new Date(`${bucket.startDate}T12:00:00`);
  const end = new Date(`${bucket.endDate}T12:00:00`);
  const dayFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit" });
  if (bucket.granularity === "day") return dayFormatter.format(start);
  if (bucket.granularity === "week") {
    return `${dayFormatter.format(start)}–${dayFormatter.format(end)}`;
  }
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(start);
}

function formatOverviewTooltipBucket(
  bucket: Pick<TemporalBucket, "startDate" | "endDate" | "granularity">,
  locale: Locale,
): string {
  const label = formatOverviewBucket(bucket, locale);
  if (bucket.granularity !== "day") return label;
  const date = new Date(`${bucket.startDate}T12:00:00`);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return `${label} · ${weekday}`;
}

function overviewEvolutionRows(analytics: ReportAnalytics, locale: Locale) {
  return analytics.temporal.map((bucket, index) => {
    const previous = analytics.previousTemporal[index]?.totalSeconds ?? 0;
    const difference = bucket.totalSeconds - previous;
    return {
      label: formatOverviewBucket(bucket, locale),
      axisLabel: formatOverviewAxisBucket(bucket, locale),
      tooltipLabel: formatOverviewTooltipBucket(bucket, locale),
      currentTotal: bucket.totalSeconds,
      previous,
      difference,
      percentageChange: previous > 0 ? (difference / previous) * 100 : null,
      isWeekday: bucket.granularity === "day" && isWeekdayDate(bucket.startDate),
    };
  });
}

function isWeekdayDate(date: string): boolean {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

type ActivityBarBackgroundProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { isWeekday?: boolean };
};

function ActivityBarBackground({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  payload,
}: ActivityBarBackgroundProps) {
  const isWeekday = payload?.isWeekday === true;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={8}
      ry={8}
      fill={isWeekday ? reportChartColors.accent : reportChartColors.muted}
      fillOpacity={isWeekday ? 0.16 : 0.2}
    />
  );
}

function overviewActivityTime(analytics: ReportAnalytics) {
  const periodSeconds =
    (getDayOffset(analytics.period.startDate, analytics.period.endDate) + 1) * 24 * 60 * 60;
  return {
    periodSeconds,
    percentage: periodSeconds > 0 ? (analytics.summary.totalSeconds / periodSeconds) * 100 : 0,
  };
}

function formatDurationAxis(seconds: number, locale: Locale): string {
  if (seconds < 3_600) return formatDuration(seconds, locale);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds / 3_600)}h`;
}

function overviewDurationAxis(maximumSeconds: number) {
  const steps = [900, 1_200, 1_800, 2_700, 3_600, 7_200, 14_400, 21_600, 28_800, 43_200, 86_400];
  const targetStep = maximumSeconds / 3;
  const step =
    steps.find((candidate) => candidate >= targetStep) ??
    Math.max(86_400, Math.ceil(targetStep / 86_400) * 86_400);
  const maximum = step * 3;
  return {
    maximum,
    ticks: [0, step, step * 2, maximum],
  };
}

function overviewWeekdayRows(analytics: ReportAnalytics, locale: Locale) {
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const;
  return weekdayOrder.map((weekday) => {
    const activity = analytics.weekdayActivity.find((item) => item.weekday === weekday)!;
    const date = new Date(Date.UTC(2026, 7, 3 + ((weekday + 6) % 7)));
    return {
      weekday: new Intl.DateTimeFormat(locale, {
        weekday: "short",
        timeZone: "UTC",
      }).format(date),
      fullLabel: new Intl.DateTimeFormat(locale, {
        weekday: "long",
        timeZone: "UTC",
      }).format(date),
      seconds: activity.totalSeconds,
    };
  });
}

function overviewConsistencyPercentage(analytics: ReportAnalytics): number {
  const periodDays = Math.max(
    1,
    getDayOffset(analytics.period.startDate, analytics.period.endDate) + 1,
  );
  return (analytics.summary.activeDays / periodDays) * 100;
}

function comparisonVariation(
  comparison: ReportAnalytics["comparison"]["metrics"]["totalSeconds"],
  locale: Locale,
  t: Translate,
  colorByDirection = false,
  showZeroAsPercentage = false,
) {
  if (comparison.previous === 0) return null;

  const change = comparison.percentageChange ?? 0;
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.abs(change),
  );
  const label = `${change > 0 ? "+" : change < 0 ? "−" : ""}${formatted}%`;
  if (change === 0) {
    return {
      label: showZeroAsPercentage ? label : t("No change"),
      accessibleLabel: t("No change from previous period"),
      direction: "neutral" as const,
      tone: "neutral" as const,
    };
  }
  return {
    label,
    accessibleLabel: `${formatted}% ${t(
      change > 0 ? "more than previous period" : "less than previous period",
    )}`,
    direction: change > 0 ? ("up" as const) : ("down" as const),
    tone: colorByDirection
      ? change > 0
        ? ("positive" as const)
        : ("negative" as const)
      : ("neutral" as const),
  };
}

function comparisonFromValues(current: number, previous: number) {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    percentageChange: previous > 0 ? (delta / previous) * 100 : null,
  };
}

function selectTopProjects(analytics: ReportAnalytics, maximum = 5) {
  const noProject = analytics.summary.projectBreakdown.find((item) => item.id === "none");
  const projects = analytics.summary.projectBreakdown.filter((item) => item.id !== "none");
  const selected = noProject
    ? [...projects.slice(0, Math.max(0, maximum - 1)), noProject]
    : projects.slice(0, maximum);
  return selected.sort(
    (first, second) => second.seconds - first.seconds || first.label.localeCompare(second.label),
  );
}

function overviewProjectRows(analytics: ReportAnalytics, projects: Project[], clients: Client[]) {
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const financialMap = new Map(
    analytics.financial.projects.map((project) => [project.id, project]),
  );

  return selectTopProjects(analytics).map((dimension) => {
    const project = dimension.id === "none" ? null : projectMap.get(dimension.id);
    const financial = financialMap.get(dimension.id);
    return {
      id: dimension.id,
      projectColor: project?.color ?? null,
      project: dimension.label,
      client: project ? clientMap.get(project.clientId)?.name : null,
      seconds: dimension.seconds,
      percentage: dimension.percentage,
      billableSeconds: financial?.billableSeconds ?? 0,
      valueByCurrency: financial?.valueByCurrency ?? {},
    };
  });
}

function ReportExportButton({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Button variant="primary" onPress={onPress}>
      <ArrowDownToLine className="size-4" />
      {t("Export")}
    </Button>
  );
}

function ReportViewSwitcher({
  value,
  onChange,
}: {
  value: ReportView;
  onChange: (value: ReportView) => void;
}) {
  const { t } = useI18n();
  const options: Array<{ value: ReportView; label: string }> = [
    { value: "overview", label: "Overview" },
    { value: "detailed", label: "Detailed" },
  ];

  return (
    <Tabs
      className="max-w-full shrink-0"
      selectedKey={value}
      onSelectionChange={(key) => {
        const nextValue = String(key);
        if (nextValue === "overview" || nextValue === "detailed") onChange(nextValue);
      }}
    >
      <Tabs.ListContainer className="max-w-full">
        <Tabs.List aria-label={t("Report views")}>
          {options.map((option) => (
            <Tabs.Tab
              key={option.value}
              id={option.value}
              className="min-w-max whitespace-nowrap px-3 sm:px-4 md:h-7"
            >
              {t(option.label)}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}

function OverviewTooltipTitle({ label, help }: { label: string; help: ReactNode }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      <OverviewAccessibleTooltip
        label={t("More information about {label}", { label })}
        content={help}
        className="size-5 min-w-5 items-center justify-center"
      >
        <CircleInfo aria-hidden="true" className="size-3.5" />
      </OverviewAccessibleTooltip>
    </span>
  );
}

function OverviewAccessibleTooltip({
  label,
  content,
  children,
  className = "",
}: {
  label: string;
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Tooltip delay={0} closeDelay={0} shouldSkipAnimation isOpen={isOpen} onOpenChange={setIsOpen}>
      <Tooltip.Trigger
        aria-label={label}
        className={`inline-flex shrink-0 ${className}`}
        tabIndex={0}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false);
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen((current) => !current);
          }
        }}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-xs" showArrow>
        {content}
      </Tooltip.Content>
    </Tooltip>
  );
}

function OverviewDashboard({
  analytics,
  projects,
  clients,
}: {
  analytics: ReportAnalytics;
  projects: Project[];
  clients: Client[];
}) {
  const { locale, t } = useI18n();
  const { summary } = analytics;
  const percentageFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const trackedVariation = comparisonVariation(
    analytics.comparison.metrics.totalSeconds,
    locale,
    t,
    true,
    true,
  );
  const billableVariation = comparisonVariation(
    analytics.comparison.metrics.billableSeconds,
    locale,
    t,
    true,
    true,
  );
  const dailyAverageVariation = comparisonVariation(
    analytics.comparison.metrics.averageSecondsPerActiveDay,
    locale,
    t,
    true,
    true,
  );
  const projectCountVariation = comparisonVariation(
    comparisonFromValues(summary.projectCount, analytics.comparison.previous.projectCount),
    locale,
    t,
    false,
    true,
  );
  const taskCountVariation = comparisonVariation(
    comparisonFromValues(summary.taskCount, analytics.comparison.previous.taskCount),
    locale,
    t,
    false,
    true,
  );
  const monetaryTotals = currencyOptions.filter(
    (currency) =>
      summary.billableValueByCurrency[currency] !== undefined ||
      analytics.comparison.billableValueByCurrency[currency] !== undefined,
  );
  const periodValueData = monetaryTotals.map((currency) => {
    const comparison = analytics.comparison.billableValueByCurrency[currency] ?? {
      current: summary.billableValueByCurrency[currency] ?? 0,
      previous: 0,
      delta: summary.billableValueByCurrency[currency] ?? 0,
      percentageChange: null,
    };
    const deltaPrefix = comparison.delta > 0 ? "+" : comparison.delta < 0 ? "−" : "";
    const percentageChange = comparison.previous > 0 ? (comparison.percentageChange ?? 0) : null;
    const percentagePrefix =
      percentageChange === null ? "" : percentageChange > 0 ? "+" : percentageChange < 0 ? "−" : "";
    return {
      currency,
      value: formatMoney(comparison.current, currency, locale),
      previous: formatMoney(comparison.previous, currency, locale),
      delta: `${deltaPrefix}${formatMoney(Math.abs(comparison.delta), currency, locale)}`,
      comparison:
        percentageChange === null
          ? null
          : `${percentagePrefix}${percentageFormatter.format(Math.abs(percentageChange))}%`,
      direction: comparison.delta > 0 ? "up" : comparison.delta < 0 ? "down" : "neutral",
    };
  });
  const predominantShift = [...analytics.shifts].sort(
    (first, second) => second.seconds - first.seconds,
  )[0];
  const hasPredominantShift = Boolean(predominantShift && predominantShift.seconds > 0);
  const evolutionData = overviewEvolutionRows(analytics, locale);
  const activityTime = overviewActivityTime(analytics);
  const formattedActivityTimePercentage = percentageFormatter.format(activityTime.percentage);
  const evolutionMetrics = [
    {
      key: "activity-time",
      label: t("Activity time"),
      value: `${formattedActivityTimePercentage}%`,
      variation: trackedVariation,
    },
    {
      key: "projects",
      label: t("Projects"),
      value: summary.projectCount,
      variation: projectCountVariation,
    },
    {
      key: "tasks",
      label: t("Tasks"),
      value: summary.taskCount,
      variation: taskCountVariation,
    },
  ];
  const evolutionTicks =
    analytics.granularity === "day" || evolutionData.length <= 6
      ? evolutionData.map((item) => item.tooltipLabel)
      : Array.from({ length: 6 }, (_, index) => {
          const dataIndex = Math.round((index * (evolutionData.length - 1)) / 5);
          return evolutionData[dataIndex]?.tooltipLabel;
        }).filter((label): label is string => Boolean(label));
  const evolutionAxisLabels = new Map(
    evolutionData.map((item) => [item.tooltipLabel, item.axisLabel] as const),
  );
  const evolutionAxis = overviewDurationAxis(
    Math.max(0, ...evolutionData.map((item) => item.currentTotal)),
  );
  const shiftData = analytics.shifts.map((shift) => {
    const percentage = summary.totalSeconds > 0 ? (shift.seconds / summary.totalSeconds) * 100 : 0;
    return {
      id: shift.shift,
      shift: t(shiftLabels[shift.shift]),
      seconds: shift.seconds,
      percentage,
      display: `${formatDuration(shift.seconds, locale)} · ${percentageFormatter.format(percentage)}%`,
    };
  });
  const projectData = overviewProjectRows(analytics, projects, clients);
  const billablePercentage = percentageFormatter.format(summary.billablePercentage);
  const internalPercentage =
    summary.totalSeconds > 0
      ? percentageFormatter.format((summary.internalSeconds / summary.totalSeconds) * 100)
      : "0";
  const billingSegments = [
    {
      key: "billable",
      name: t("Billable"),
      value: summary.billableSeconds,
      color: reportChartColors.accent,
      opacity: 1,
      percentage: billablePercentage,
    },
    {
      key: "internal",
      name: t("Internal"),
      value: summary.internalSeconds,
      color: reportChartColors.accent,
      opacity: 0.28,
      percentage: internalPercentage,
    },
  ];
  const billingData = billingSegments.filter((item) => item.value > 0);
  const highestActivityPeriod = evolutionData.reduce<(typeof evolutionData)[number] | null>(
    (highest, item) => (!highest || item.currentTotal > highest.currentTotal ? item : highest),
    null,
  );
  const evolutionSummary = [
    `${t("Activity time")}: ${formattedActivityTimePercentage}%`,
    `${t("Tracked")}: ${formatDuration(summary.totalSeconds, locale)}`,
    `${t("Period")}: ${formatDuration(activityTime.periodSeconds, locale)}`,
    `${t("Projects")}: ${summary.projectCount}`,
    `${t("Tasks")}: ${summary.taskCount}`,
    ...(highestActivityPeriod && highestActivityPeriod.currentTotal > 0
      ? [
          `${t("Highest activity period")}: ${highestActivityPeriod.label}, ${formatDuration(
            highestActivityPeriod.currentTotal,
            locale,
          )}`,
        ]
      : []),
  ].join(". ");
  const shiftSummary = shiftData.map((item) => `${item.shift}: ${item.display}`).join(". ");
  const projectSummary = projectData
    .map(
      (item) =>
        `${item.project}: ${formatDuration(item.seconds, locale)}, ${percentageFormatter.format(
          item.percentage,
        )}%.`,
    )
    .join(". ");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
      <div className="grid min-w-0 xl:col-span-3">
        <ReportKpi
          title={
            <OverviewTooltipTitle
              label={t("Tracked time")}
              help={t("Comparisons use the previous equivalent period.")}
            />
          }
          value={formatDuration(summary.totalSeconds, locale)}
          variation={trackedVariation}
          neutralComparisonLabel={t("No comparison")}
          showNeutralComparison={false}
          comparisonContext={trackedVariation ? t("vs. previous period") : undefined}
          contentDescription={`${t("Tracked")}: ${formatDuration(
            summary.totalSeconds,
            locale,
          )}. ${t("Active days")}: ${summary.activeDays}. ${t("Average/day")}: ${formatDuration(
            summary.averageSecondsPerActiveDay,
            locale,
          )}.`}
        />
      </div>
      <div className="grid min-w-0 xl:col-span-3">
        <ReportKpi
          title={
            <OverviewTooltipTitle
              label={t("Billable time")}
              help={t("Only entries marked as billable are included in this total.")}
            />
          }
          value={formatDuration(summary.billableSeconds, locale)}
          variation={billableVariation}
          neutralComparisonLabel={t("No comparison")}
          showNeutralComparison={false}
          comparisonContext={billableVariation ? t("vs. previous period") : undefined}
          contentDescription={`${t("Billable")}: ${formatDuration(
            summary.billableSeconds,
            locale,
          )}, ${billablePercentage}% ${t("of tracked time")}. ${t(
            "Internal",
          )}: ${formatDuration(summary.internalSeconds, locale)}.`}
        />
      </div>
      <div className="grid min-w-0 xl:col-span-3">
        <ReportWidget
          title={
            <OverviewTooltipTitle
              label={t("Estimated billable value")}
              help={`${t(
                "Estimate based on billable time and the hourly-rate snapshot of each entry.",
              )} ${t("No currency conversion applied.")}`}
            />
          }
          contentDescription={periodValueData
            .map(
              (item) =>
                `${item.currency}: ${item.value}.${
                  item.comparison
                    ? ` ${t("Previous")}: ${item.previous}. ${t("Change")}: ${item.delta}.`
                    : ""
                }`,
            )
            .join(" ")}
        >
          <div className="space-y-3">
            {periodValueData.map((item) => {
              const DirectionIcon =
                item.direction === "up" ? ArrowUp : item.direction === "down" ? ArrowDown : Minus;
              return (
                <div key={item.currency} className="min-w-0 space-y-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <Typography type={periodValueData.length > 1 ? "h3" : "h2"} weight="semibold">
                      {item.value}
                    </Typography>
                    <Typography type="body-xs" color="muted">
                      {item.currency}
                    </Typography>
                  </div>
                  {item.comparison ? (
                    <div className="flex items-center gap-2">
                      <OverviewAccessibleTooltip
                        label={`${t("Change")}: ${item.comparison}. ${t("Previous")}: ${item.previous}`}
                        content={`${t("Previous")}: ${item.previous} · ${t("Change")}: ${item.delta}`}
                      >
                        <Chip
                          size="sm"
                          variant="soft"
                          color={
                            item.direction === "up"
                              ? "success"
                              : item.direction === "down"
                                ? "danger"
                                : "default"
                          }
                        >
                          <DirectionIcon aria-hidden="true" className="size-3" />
                          <Chip.Label>{item.comparison}</Chip.Label>
                        </Chip>
                      </OverviewAccessibleTooltip>
                      <Typography type="body-xs" color="muted">
                        {t("vs. previous period")}
                      </Typography>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </ReportWidget>
      </div>
      <div className="grid min-w-0 xl:col-span-3">
        <ReportKpi
          title={
            <OverviewTooltipTitle
              label={t("Average/day")}
              help={t("Average tracked time on days with activity.")}
            />
          }
          value={formatDuration(summary.averageSecondsPerActiveDay, locale)}
          variation={dailyAverageVariation}
          neutralComparisonLabel={t("No comparison")}
          showNeutralComparison={false}
          comparisonContext={dailyAverageVariation ? t("vs. previous period") : undefined}
          contentDescription={`${t("Average/day")}: ${formatDuration(
            summary.averageSecondsPerActiveDay,
            locale,
          )}. ${t("Active days")}: ${summary.activeDays}.`}
        />
      </div>
      <div className="grid min-w-0 md:col-span-2 xl:col-span-8">
        <ReportWidget
          title={
            <OverviewTooltipTitle
              label={t("Activity evolution")}
              help={t("Bars show tracked time across the selected period.")}
            />
          }
          contentDescription={evolutionSummary}
          isEmpty={summary.totalSeconds === 0}
          emptyState={{ title: t("No chart data") }}
        >
          <div className="min-w-0 space-y-5">
            <div className="grid min-w-0 grid-cols-3 gap-6">
              {evolutionMetrics.map((metric) => {
                const DirectionIcon =
                  metric.variation?.direction === "up"
                    ? ArrowUp
                    : metric.variation?.direction === "down"
                      ? ArrowDown
                      : Minus;
                const variationColor =
                  metric.variation?.tone === "positive"
                    ? "success"
                    : metric.variation?.tone === "negative"
                      ? "danger"
                      : "default";
                return (
                  <div key={metric.key} className="min-w-0 space-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <Typography type="h3" weight="semibold">
                        {metric.value}
                      </Typography>
                      {metric.variation ? (
                        <Chip
                          aria-label={metric.variation.accessibleLabel}
                          color={variationColor}
                          size="sm"
                          variant="tertiary"
                          className="px-0 py-0"
                        >
                          <DirectionIcon aria-hidden="true" className="size-3" />
                          <Chip.Label>{metric.variation.label}</Chip.Label>
                        </Chip>
                      ) : null}
                    </div>
                    <Typography type="body-xs" color="muted">
                      {metric.label}
                    </Typography>
                  </div>
                );
              })}
            </div>
            <ReportChart
              config={{
                currentTotal: { label: t("Tracked"), color: reportChartColors.accent },
              }}
              summary={evolutionSummary}
              height="tall"
            >
              <BarChart
                accessibilityLayer
                barCategoryGap="50%"
                data={evolutionData}
                margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
              >
                <CartesianGrid vertical={false} strokeOpacity={0.16} strokeWidth={1} />
                <XAxis
                  {...reportChartAxisProps}
                  dataKey="tooltipLabel"
                  ticks={evolutionTicks}
                  interval={0}
                  padding={{ left: 8, right: 8 }}
                  tickMargin={8}
                  tickFormatter={(value) =>
                    shortenReportChartLabel(evolutionAxisLabels.get(String(value)) ?? value, 7)
                  }
                />
                <YAxis
                  {...reportChartAxisProps}
                  domain={[0, evolutionAxis.maximum]}
                  ticks={evolutionAxis.ticks}
                  width={40}
                  tickMargin={6}
                  tickFormatter={(value) => formatDurationAxis(Number(value), locale)}
                />
                <ChartTooltip
                  {...reportChartTooltipProps}
                  content={
                    <ChartTooltipContent
                      hideSeriesLabel
                      valueFormatter={(value) => formatDuration(Number(value ?? 0), locale)}
                    />
                  }
                />
                <Bar
                  {...reportVerticalBarProps}
                  background={ActivityBarBackground}
                  barSize={evolutionData.length > 24 ? 12 : evolutionData.length > 12 ? 14 : 16}
                  dataKey="currentTotal"
                  fill={reportChartColors.accent}
                  radius={[8, 8, 8, 8]}
                />
              </BarChart>
            </ReportChart>
          </div>
        </ReportWidget>
      </div>
      <div className="grid min-w-0 md:col-span-2 xl:col-span-4">
        <ReportChartWidget
          title={
            <OverviewTooltipTitle
              label={t("Time composition")}
              help={t("Shows how tracked time is split between billable and internal entries.")}
            />
          }
          contentDescription={`${t("Billable")}: ${formatDuration(
            summary.billableSeconds,
            locale,
          )}, ${billablePercentage}%. ${t("Internal")}: ${formatDuration(
            summary.internalSeconds,
            locale,
          )}, ${internalPercentage}%.`}
          config={{
            billable: { label: t("Billable"), color: reportChartColors.accent },
            internal: { label: t("Internal"), color: reportChartColors.accent },
          }}
          summary={`${t("Billable")}: ${billablePercentage}%. ${t(
            "Internal",
          )}: ${internalPercentage}%. ${billablePercentage}% ${t("of tracked time is billable")}.`}
          width="compact"
          height="tall"
          legend={
            <div className="divide-y divide-divider" aria-label={t("Chart legend")}>
              {billingSegments.map((item) => (
                <div
                  key={item.key}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full bg-accent"
                      style={{ opacity: item.opacity }}
                      aria-hidden="true"
                    />
                    <Typography type="body-sm" color="muted" weight="medium">
                      {item.name}
                    </Typography>
                  </div>
                  <Typography type="body-sm" weight="semibold" className="tabular-nums">
                    {formatDuration(item.value, locale)}
                  </Typography>
                  <Typography
                    type="body-xs"
                    color="muted"
                    weight="medium"
                    className="min-w-8 text-right tabular-nums"
                  >
                    {item.percentage}%
                  </Typography>
                </div>
              ))}
            </div>
          }
          isEmpty={summary.totalSeconds === 0}
          emptyState={{ title: t("No chart data") }}
        >
          <PieChart accessibilityLayer>
            <ChartTooltip
              {...reportChartTooltipProps}
              content={
                <ChartTooltipContent
                  hideLabel
                  valueFormatter={(value) => {
                    const seconds = Number(value ?? 0);
                    const percentage =
                      summary.totalSeconds > 0 ? (seconds / summary.totalSeconds) * 100 : 0;
                    return `${formatDuration(seconds, locale)} · ${percentageFormatter.format(
                      percentage,
                    )}%`;
                  }}
                />
              }
            />
            <Pie
              data={billingData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius="58%"
              outerRadius="82%"
              cornerRadius={4}
              paddingAngle={billingData.length > 1 ? 2 : 0}
              isAnimationActive={false}
            >
              <ChartLabel
                position="center"
                content={({ viewBox }) => {
                  const center = viewBox as { cx?: number; cy?: number } | undefined;
                  if (center?.cx === undefined || center.cy === undefined) return null;

                  return (
                    <text x={center.cx} y={center.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan
                        x={center.cx}
                        dy="-0.25em"
                        className="fill-foreground text-xl font-semibold"
                      >
                        {billablePercentage}%
                      </tspan>
                      <tspan x={center.cx} dy="1.65em" className="fill-muted text-xs font-medium">
                        {t("Billable")}
                      </tspan>
                    </text>
                  );
                }}
              />
              {billingData.map((item) => (
                <Cell key={item.key} fill={item.color} fillOpacity={item.opacity} />
              ))}
            </Pie>
          </PieChart>
        </ReportChartWidget>
      </div>
      <div className="grid min-w-0 md:col-span-2 xl:col-span-8">
        <ReportWidget
          title={t("Top projects")}
          contentDescription={projectSummary || t("No activity")}
          isEmpty={projectData.length === 0}
          emptyState={{ title: t("No projects found") }}
        >
          <DataTable
            label={t("Top projects")}
            contentClassName="table-auto"
            scrollHint={t("Scroll horizontally to see all columns")}
          >
            <Table.Header>
              <Table.Column isRowHeader className="w-full min-w-64">
                {t("Project / client")}
              </Table.Column>
              <Table.Column className="w-36 whitespace-nowrap">{t("Tracked")}</Table.Column>
              <Table.Column className="w-px whitespace-nowrap text-center">
                {t("Billing")}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {projectData.map((project) => (
                <Table.Row key={project.id}>
                  <Table.Cell>
                    <div className="min-w-0">
                      <ProjectLabel
                        project={project.projectColor ? { color: project.projectColor } : null}
                        label={project.id === "none" ? t("No project") : project.project}
                      />
                      <Typography type="body-xs" color="muted" truncate>
                        {project.client ?? t("No client")}
                      </Typography>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="w-36 max-w-full space-y-2">
                      <div className="flex items-center justify-between gap-3 whitespace-nowrap">
                        <Typography type="body-sm" weight="medium">
                          {formatDuration(project.seconds, locale)}
                        </Typography>
                        <Typography type="body-xs" color="muted">
                          {percentageFormatter.format(project.percentage)}%
                        </Typography>
                      </div>
                      <ProgressBar
                        aria-label={`${project.project}: ${percentageFormatter.format(
                          project.percentage,
                        )}%`}
                        color="accent"
                        size="sm"
                        value={project.percentage}
                      >
                        <ProgressBar.Track>
                          <ProgressBar.Fill />
                        </ProgressBar.Track>
                      </ProgressBar>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-center">
                    {formatMoneyTotals(project.valueByCurrency, locale) || "—"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </DataTable>
        </ReportWidget>
      </div>
      <div className="grid min-w-0 md:col-span-2 xl:col-span-4">
        <ReportWidget
          title={t("Hours by shift")}
          contentDescription={shiftSummary || t("No activity")}
          width="compact"
          className="h-full"
          isEmpty={summary.totalSeconds === 0}
          emptyState={{ title: t("No chart data") }}
        >
          <div className="grid h-full grid-rows-[repeat(4,minmax(0,1fr))] gap-2">
            {shiftData.map((item) => {
              const isPredominant = hasPredominantShift && predominantShift?.shift === item.id;
              const [primaryDuration, secondaryDuration] = formatDuration(
                item.seconds,
                locale,
              ).split(" ");

              return (
                <OverviewAccessibleTooltip
                  key={item.id}
                  label={`${item.shift}: ${item.display}`}
                  content={`${item.shift}: ${item.display}`}
                  className="block min-w-0"
                >
                  <Card
                    variant="secondary"
                    className="relative h-full min-h-0 min-w-0 overflow-visible p-0"
                  >
                    <Card.Content className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Typography
                          type="h1"
                          aria-hidden="true"
                          {...(item.id === "overnight" ? { className: "scale-110" } : {})}
                        >
                          {shiftEmoji[item.id]}
                        </Typography>
                        <Typography type="body-sm" weight="medium" truncate>
                          {item.shift}
                        </Typography>
                      </div>
                      <div className="flex items-baseline gap-1 whitespace-nowrap">
                        <Typography type="body-sm" weight="semibold">
                          {primaryDuration}
                        </Typography>
                        {secondaryDuration ? (
                          <Typography type="body-xs" color="muted" weight="medium">
                            {secondaryDuration}
                          </Typography>
                        ) : null}
                      </div>
                      <Typography
                        type="body-xs"
                        color="muted"
                        weight="medium"
                        className="whitespace-nowrap"
                      >
                        {percentageFormatter.format(item.percentage)}%
                      </Typography>
                    </Card.Content>
                    {isPredominant ? (
                      <Badge
                        size="sm"
                        variant="soft"
                        color="accent"
                        placement="top-right"
                        style={{ transform: "translate(0, 0)" }}
                      >
                        <Badge.Label className="truncate">{t("Predominant")}</Badge.Label>
                      </Badge>
                    ) : null}
                  </Card>
                </OverviewAccessibleTooltip>
              );
            })}
          </div>
        </ReportWidget>
      </div>
    </div>
  );
}

function DetailedReport({
  entries,
  onClear,
  members,
  projects,
  clients,
  columns,
  onChangeColumns,
  fallbackForEntry,
}: {
  entries: TimeEntry[];
  onClear: () => void;
  members: Member[];
  projects: Project[];
  clients: Client[];
  columns: DetailedColumn[];
  onChangeColumns: (columns: DetailedColumn[]) => void;
  fallbackForEntry: (entry: TimeEntry) => BillingPreference;
}) {
  const { locale, t } = useI18n();
  const visibleColumns = detailedColumnOptions.filter((column) => columns.includes(column.id));
  return (
    <ReportTableWidget
      title={t("Detailed entries")}
      action={<ReportColumnPicker columns={columns} onChange={onChangeColumns} />}
      contentDescription={t("Detailed report table")}
      isEmpty={entries.length === 0}
      emptyState={{
        title: t("No time entries match"),
        description: t("Try a wider period or clear one of the active filters."),
        action: (
          <Button variant="secondary" onPress={onClear}>
            <ArrowRotateLeft className="size-4" />
            {t("Clear filters")}
          </Button>
        ),
      }}
    >
      <DataTable
        label={t("Detailed report table")}
        minWidth="min-w-full"
        contentClassName="table-auto"
        scrollContainerClassName="max-h-[60vh] overflow-y-auto md:max-h-[calc(100vh-22.5rem)]"
      >
        <Table.Header className="sticky top-0 z-10">
          {visibleColumns.map((column, index) => (
            <Table.Column
              key={column.id}
              isRowHeader={index === 0}
              {...(column.id === "description"
                ? { className: "max-w-[26rem]" }
                : column.id === "task"
                  ? { className: "max-w-[22rem]" }
                  : {})}
            >
              {t(column.label)}
            </Table.Column>
          ))}
        </Table.Header>
        <Table.Body>
          {entries.map((entry) => (
            <Table.Row key={entry.id}>
              {visibleColumns.map((column) => (
                <Table.Cell
                  key={column.id}
                  className={
                    column.id === "task"
                      ? "max-w-[22rem] whitespace-normal"
                      : column.id === "description"
                        ? "max-w-[26rem] whitespace-normal"
                        : column.id === "projectClient"
                          ? ""
                          : "whitespace-nowrap"
                  }
                >
                  {renderDetailedCell(
                    entry,
                    column.id,
                    members,
                    projects,
                    clients,
                    fallbackForEntry,
                    locale,
                  )}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </DataTable>
    </ReportTableWidget>
  );
}

function renderDetailedCell(
  entry: TimeEntry,
  column: DetailedColumn,
  members: Member[],
  projects: Project[],
  clients: Client[],
  fallbackForEntry: (entry: TimeEntry) => BillingPreference,
  locale: Locale,
): ReactNode {
  if (column === "date") return formatDate(entry.date, locale);
  if (column === "member") return nameForMember(members, entry.userId);
  if (column === "projectClient") {
    return (
      <div className="min-w-0">
        <ProjectLabel
          project={projectFor(projects, entry.projectId)}
          label={projectNameFor(projects, entry.projectId)}
        />
        <div className="truncate">{clientNameFor(clients, projects, entry.projectId)}</div>
      </div>
    );
  }
  if (column === "task") {
    return (
      <div className="max-w-[22rem] whitespace-normal break-words leading-relaxed">
        {entry.task}
      </div>
    );
  }
  if (column === "description") {
    return (
      <div className="max-w-[26rem] whitespace-normal break-words leading-relaxed">
        {entry.description ?? "—"}
      </div>
    );
  }
  if (column === "start") return entry.start;
  if (column === "end") return endLabel(entry);
  if (column === "duration") return formatDuration(entry.seconds, locale);
  if (column === "billability") return <BillableIndicator billable={entry.billable} />;
  const billing = billingForEntry(entry, fallbackForEntry(entry));
  if (column === "hourlyRate") return formatMoney(billing.hourlyRate, billing.currency, locale);
  if (column === "currency") return billing.currency;
  return formatMoney(billableValue(entry, billing), billing.currency, locale);
}

function ReportColumnPicker({
  columns,
  onChange,
}: {
  columns: DetailedColumn[];
  onChange: (columns: DetailedColumn[]) => void;
}) {
  const { t } = useI18n();
  return (
    <Popover>
      <Popover.Trigger
        render={(triggerProps) => {
          const buttonProps = Object.fromEntries(
            Object.entries(triggerProps).filter(([, value]) => value !== undefined),
          );
          return (
            <Button {...buttonProps} variant="tertiary" size="sm" aria-label={t("Choose columns")}>
              {t("Columns")}
            </Button>
          );
        }}
      />
      <Popover.Content placement="bottom end" className="w-64 max-w-[calc(100vw-1rem)] p-2">
        <Popover.Dialog>
          <Typography type="body-xs" color="muted" weight="semibold" className="px-2 py-2">
            {t("Visible columns")}
          </Typography>
          <div className="space-y-1">
            {detailedColumnOptions.map((column) => {
              const checked = columns.includes(column.id);
              return (
                <Checkbox
                  key={column.id}
                  isSelected={checked}
                  isDisabled={checked && columns.length === 1}
                  onChange={(selected) => {
                    const next = selected
                      ? [...columns, column.id]
                      : columns.filter((current) => current !== column.id);
                    onChange([...new Set(next)]);
                  }}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Label>{t(column.label)}</Label>
                  </Checkbox.Content>
                </Checkbox>
              );
            })}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
