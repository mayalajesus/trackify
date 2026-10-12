import { useReportsController } from "@/lib/reports/use-reports-controller";

import { createFileRoute } from "@tanstack/react-router";

import { DetailedReport } from "@/components/detailed-report";

import { ExportModal } from "@/components/export-modal";

import { ReportFiltersBar } from "@/components/report-filters";

import { PageHeader } from "@/components/page-header";

import { CardsSkeleton, ErrorBlock } from "@/components/states";

import { formatReportPeriod, reportPeriodPresets } from "@/lib/format";

import { isLegacyTeamReportView, normalizeReportView } from "@/lib/report-views";

import { defaultVisibleFilters } from "../lib/reports/search";

import type { ReportSearch } from "../lib/reports/search";

import { isPeriodPreset } from "../lib/reports/search";

import { isGroupDimension } from "../lib/reports/search";

import { asText } from "../lib/reports/search";

import { asCsv } from "../lib/reports/search";

import { encodeIds } from "../lib/reports/search";

import { ReportExportButton } from "../components/reports/report-controls";

import { ReportViewSwitcher } from "../components/reports/report-controls";

import { OverviewDashboard } from "../components/reports/overview-dashboard";

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
    billability: "all",
    currency: "all",
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
  const {
    search,
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
  } = useReportsController(Route);
  return (
    <div className={`reports-page reports-page--${search.view}`}>
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
            <OverviewDashboard
              analytics={reportAnalytics}
              entries={currencyFilteredEntries}
              projects={projects}
              clients={clients}
              weekStartsOn={weekStartsOn}
            />
          ) : (
            <DetailedReport
              entries={filteredEntries}
              onClear={clearFilters}
              members={members}
              projects={projects}
              clients={clients}
              periodLabel={
                search.preset === "custom"
                  ? formatReportPeriod(range, locale)
                  : t(
                      reportPeriodPresets.find((option) => option.id === search.preset)?.label ??
                        "Custom",
                    )
              }
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
