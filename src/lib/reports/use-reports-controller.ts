import { type ReportFilterKey, type ReportFilterValues } from "@/components/report-filters";
import { createApiDataSource } from "@/lib/api-data-source";
import { billingForEntry, sumBillableValues, type BillingPreference } from "@/lib/billing";
import type { TimeEntry } from "@/lib/domain";
import {
  getDayOffset,
  getMonthBounds,
  getYearBounds,
  normalizeSearch,
  shiftDate,
  type DateRange,
  type ReportPeriodPreset,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { calculateReportAnalytics, getPreviousEquivalentPeriod } from "@/lib/report-analytics";
import {
  constrainReportFiltersToScope,
  createReportFilterStorageKey,
  hasExplicitReportFilterParams,
  parseStoredReportFiltersValue,
  readStoredReportFilters,
  resolveInitialReportFilters,
  writeStoredReportFilters,
  type StoredReportFilters,
} from "@/lib/report-filter-storage";
import { buildReportGroups, type GroupDimension } from "@/lib/report-groups";
import { entriesForReportWindow, reportEntriesQueryKey } from "@/lib/report-query";
import { useReportExport } from "@/lib/reports/use-report-export";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { compareEntries, getReportExportView } from "./export-format";
import type { ReportSearch } from "./search";
import {
  defaultDetailedColumns,
  defaultVisibleFilters,
  detailedColumnOptions,
  encodeIds,
  makeRange,
  parseIds,
  searchPatchFromStoredFilters,
  storedFiltersFromSearch,
} from "./search";

export function useReportsController(Route: {
  useSearch: () => ReportSearch;
  useNavigate: () => (options: {
    search: ReportSearch;
    replace: boolean;
    resetScroll: boolean;
  }) => Promise<void>;
}) {
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

  const weekStartsOn: 0 | 1 = settings.weekStart === "sunday" ? 0 : 1;
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
    ["member", "client", "project", "description"].includes(key),
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
      constrainReportFiltersToScope(
        { ...filters, billability: "all", currency: "all" },
        {
          currentUserId,
          canViewTeam: showTeam,
          memberIds: members
            .filter((member) => member.status === "active")
            .map((member) => member.id),
          clientIds: clients.map((client) => client.id),
          projectIds: projects.map((project) => project.id),
          visibleFilters: ["member", "client", "project", "description"],
          detailedColumns: detailedColumnOptions.map((column) => column.id),
        },
      ),
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
  const { exportPayload } = useReportExport({
    t,
    exportView,
    currentWorkspace,
    range,
    locale,
    reportScope,
    search,
    exportRecords,
    exportTotal,
    exportBillable,
    exportInternal,
    exportBillableValues,
    reportAnalytics,
    projects,
    clients,
    filterValues,
    workspaceBilling,
    filteredEntries,
    memberMap,
    fallbackForEntry,
    effectiveSubgroup,
    effectiveGroup,
    groups,
    total,
  });

  const description = {
    overview: t("See tracked time, billability, estimated value and activity distribution."),
    detailed: t("Inspect each entry by project, client and member."),
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
  return {
    search,
    entries,
    projects,
    clients,
    members,
    today,
    locale,
    t,
    exportOpen,
    setExportOpen,
    weekStartsOn,
    range,
    showTeam,
    filterValues,
    visibleFilters,
    filterPreferencesReady,
    updateSearch,
    updatePeriod,
    shiftReportPeriod,
    reportQuery,
    currencyFilteredEntries,
    filteredEntries,
    reportAnalytics,
    reportScope,
    exportPayload,
    description,
    clearFilters,
    reportInitialLoading,
    reportError,
  };
}
