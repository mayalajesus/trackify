import {
  billableValue,
  billingForEntry,
  currencyOptions,
  formatMoney,
  formatMoneyTotals,
} from "@/lib/billing";
import {
  formatClock,
  formatDate,
  formatDateRange,
  formatDuration,
  getEndDateForEntry,
} from "@/lib/format";
import type { ReportExportPayload, ReportPdfEntry } from "@/lib/report-export";
import { clientNameFor, projectNameFor } from "@/lib/report-groups";
import { useMemo } from "react";
import { endLabel, exportDate, exportTime } from "./export-format";
import {
  overviewActivityTime,
  overviewConsistencyPercentage,
  overviewEvolutionRows,
  overviewProjectRows,
  overviewWeekdayRows,
  shiftLabels,
} from "./overview-model";
import { parseIds } from "./search";
export function useReportExport({
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
}: {
  t: ReturnType<typeof import("@/lib/i18n").useI18n>["t"];
  exportView: "overview" | "detailed";
  currentWorkspace: import("@/lib/account-types").Workspace | null;
  range: import("@/lib/format").DateRange;
  locale: import("@/lib/i18n").Locale;
  reportScope: string;
  search: Required<import("@/lib/reports/search").ReportSearch>;
  exportRecords: number;
  exportTotal: number;
  exportBillable: number;
  exportInternal: number;
  exportBillableValues: Partial<Record<"BRL" | "USD" | "EUR" | "GBP", number>>;
  reportAnalytics: import("@/lib/report-analytics").ReportAnalytics;
  projects: import("@/lib/domain").Project[];
  clients: import("@/lib/domain").Client[];
  filterValues: import("@/components/report-filters").ReportFilterValues;
  workspaceBilling: import("@/lib/billing").BillingPreference;
  filteredEntries: import("@/lib/domain").TimeEntry[];
  memberMap: Map<string, import("@/lib/domain").Member>;
  fallbackForEntry: (
    entry: import("@/lib/domain").TimeEntry,
  ) => import("@/lib/billing").BillingPreference;
  effectiveSubgroup: import("@/lib/report-groups").GroupDimension | "none";
  effectiveGroup: import("@/lib/report-groups").GroupDimension;
  groups: import("@/lib/report-groups").ReportGroup[];
  total: number;
}) {
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
  return { exportContext, exportPayload };
}
