import { DataTable } from "@/components/data-table";
import { ProjectLabel } from "@/components/project-color";
import { ReportDistribution } from "@/components/report-distribution";
import {
  ReportChartWidget,
  ReportKpi,
  ReportWidget,
  reportChartColors,
  reportChartTooltipProps,
} from "@/components/report-widget";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { Client, Project, TimeEntry } from "@/lib/domain";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { type ReportAnalytics, type ShiftId } from "@/lib/report-analytics";
import { CircleInfo } from "@gravity-ui/icons";
import { ProgressBar } from "@heroui/react/progress-bar";
import { Table } from "@heroui/react/table";
import { Tooltip } from "@heroui/react/tooltip";
import { Typography } from "@heroui/react/typography";
import { useState, type ReactNode } from "react";
import { Cell, Label as ChartLabel, Pie, PieChart } from "recharts";
import { overviewProjectRows, shiftEmoji, shiftLabels } from "../../lib/reports/overview-model";

export { shiftLabels } from "../../lib/reports/overview-model";

export { shiftEmoji } from "../../lib/reports/overview-model";

export { formatOverviewBucket } from "../../lib/reports/overview-model";

export { formatOverviewAxisBucket } from "../../lib/reports/overview-model";

export { formatOverviewTooltipBucket } from "../../lib/reports/overview-model";

export { overviewEvolutionRows } from "../../lib/reports/overview-model";

export { isWeekdayDate } from "../../lib/reports/overview-model";

export { overviewActivityTime } from "../../lib/reports/overview-model";

export { overviewWeekdayRows } from "../../lib/reports/overview-model";

export { overviewConsistencyPercentage } from "../../lib/reports/overview-model";

export { selectTopProjects } from "../../lib/reports/overview-model";

export { overviewProjectRows } from "../../lib/reports/overview-model";

function formatKpiName(value: string | undefined, locale: string): string {
  const name = value?.trim().toLocaleLowerCase(locale);
  return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : "—";
}

export function OverviewTooltipTitle({ label, help }: { label: string; help: ReactNode }) {
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

export function OverviewAccessibleTooltip({
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

export function OverviewDashboard({
  entries,
  weekStartsOn,
  analytics,
  projects,
  clients,
}: {
  analytics: ReportAnalytics;
  entries: TimeEntry[];
  weekStartsOn: 0 | 1;
  projects: Project[];
  clients: Client[];
}) {
  const { locale, t } = useI18n();
  const { summary } = analytics;
  const percentageFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const shiftOrder: ShiftId[] = ["morning", "afternoon", "night", "overnight"];
  const shiftData = [...analytics.shifts]
    .sort((a, b) => shiftOrder.indexOf(a.shift) - shiftOrder.indexOf(b.shift))
    .map((shift) => {
      const percentage =
        summary.totalSeconds > 0 ? (shift.seconds / summary.totalSeconds) * 100 : 0;
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
      color: reportChartColors.neutral,
      opacity: 1,
      percentage: internalPercentage,
    },
  ];
  const billingData = billingSegments.filter((item) => item.value > 0);
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
    <div className="reports-overview-grid">
      <div className="grid min-w-0 xl:col-span-3">
        <ReportKpi
          title={
            <OverviewTooltipTitle
              label={t("Tracked time")}
              help={t("Comparisons use the previous equivalent period.")}
            />
          }
          value={formatDuration(summary.totalSeconds, locale)}
          neutralComparisonLabel={t("No comparison")}
          showNeutralComparison={false}
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
              label={t("Top project")}
              help={t("Project with the most tracked time in the selected period.")}
            />
          }
          value={
            <span className="break-words">{formatKpiName(summary.topProject?.label, locale)}</span>
          }
          contentDescription={t("Project with the most tracked time in the selected period.")}
          showNeutralComparison={false}
        />
      </div>
      <div className="grid min-w-0 xl:col-span-3">
        <ReportKpi
          title={
            <OverviewTooltipTitle
              label={t("Top client")}
              help={t("Client with the most tracked time in the selected period.")}
            />
          }
          value={
            <span className="break-words">{formatKpiName(summary.topClient?.label, locale)}</span>
          }
          contentDescription={t("Client with the most tracked time in the selected period.")}
          showNeutralComparison={false}
        />
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
          neutralComparisonLabel={t("No comparison")}
          showNeutralComparison={false}
          contentDescription={`${t("Average/day")}: ${formatDuration(
            summary.averageSecondsPerActiveDay,
            locale,
          )}. ${t("Active days")}: ${summary.activeDays}.`}
        />
      </div>
      <div className="report-distribution-slot">
        <ReportDistribution
          analytics={analytics}
          entries={entries}
          projects={projects}
          weekStartsOn={weekStartsOn}
        />
      </div>
      <div className="report-projects-slot">
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
              <Table.Column isRowHeader className="w-full min-w-0">
                {t("Project / client")}
              </Table.Column>
              <Table.Column className="w-36 whitespace-nowrap">{t("Tracked")}</Table.Column>
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
                </Table.Row>
              ))}
            </Table.Body>
          </DataTable>
        </ReportWidget>
      </div>
      <div className="report-composition-slot">
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
            internal: { label: t("Internal"), color: reportChartColors.neutral },
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
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color, opacity: item.opacity }}
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
              cornerRadius={0}
              paddingAngle={0}
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
      <div className="report-shifts-slot">
        <ReportWidget
          title={<span className="text-sm font-normal">{t("Hours by shift")}</span>}
          contentDescription={shiftSummary}
          width="compact"
          className="min-h-[133px] rounded-3xl"
        >
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {shiftData.map((item) => (
              <OverviewAccessibleTooltip
                key={item.id}
                label={`${item.shift}: ${item.display}`}
                content={`${item.shift}: ${item.display}`}
                className="block min-w-0 rounded-3xl"
              >
                <div className="flex h-14 min-w-0 items-center justify-between gap-1 rounded-3xl bg-background px-2.5 xl:gap-2">
                  <div className="flex min-w-0 items-center gap-1 xl:gap-2">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center text-[40px] leading-none"
                    >
                      {shiftEmoji[item.id]}
                    </span>
                    <span className="truncate text-sm">{item.shift}</span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap xl:gap-3">
                    <span className="text-sm font-medium tabular-nums">
                      {formatDuration(item.seconds, locale)}
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {percentageFormatter.format(item.percentage)}%
                    </span>
                  </div>
                </div>
              </OverviewAccessibleTooltip>
            ))}
          </div>
        </ReportWidget>
      </div>
    </div>
  );
}
