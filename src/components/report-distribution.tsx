import { useMemo, useState } from "react";
import { Tabs } from "@heroui/react/tabs";
import { Tooltip } from "@heroui/react/tooltip";
import { CircleInfo } from "@gravity-ui/icons";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ReportChart, ReportWidget, reportChartAxisProps } from "./report-widget";
import { ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { groupEntriesByTime, type ReportAnalytics } from "@/lib/report-analytics";
import { formatClock, formatDuration } from "@/lib/format";
import {
  distributionHourScale,
  formatDistributionDate,
  formatDistributionPeriod,
} from "@/lib/reports/distribution-format";
import type { Project, TimeEntry } from "@/lib/domain";
import { projectColorValue } from "@/lib/project-colors";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export function ReportDistribution({
  analytics,
  entries,
  projects,
  weekStartsOn,
}: {
  analytics: ReportAnalytics;
  entries: TimeEntry[];
  projects: Project[];
  weekStartsOn: 0 | 1;
}) {
  const { locale, t } = useI18n();
  const { preferences } = useStore();
  const [mode, setMode] = useState("total");
  const series = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.projectId ?? "none"))].map((id, index) => {
        const project = projects.find((item) => item.id === id);
        return {
          id,
          key: `project${index}`,
          label: project?.name ?? t("No project"),
          color: project ? projectColorValue(project.color) : "var(--muted)",
        };
      }),
    [entries, projects, t],
  );
  const data = useMemo(() => {
    const buckets = series.map((item) =>
      groupEntriesByTime(
        entries.filter((entry) => (entry.projectId ?? "none") === item.id),
        {
          range: analytics.period,
          timeZone: preferences.timezone,
          weekStartsOn,
        },
      ),
    );
    return analytics.temporal.map((bucket) => ({
      label: formatDistributionDate(bucket.startDate, locale, analytics.granularity === "day"),
      total: bucket.totalSeconds,
      ...Object.fromEntries(
        series.map((item, index) => [
          item.key,
          buckets[index]?.find((part) => part.key === bucket.key)?.totalSeconds ?? 0,
        ]),
      ),
    }));
  }, [analytics, entries, locale, preferences.timezone, series, weekStartsOn]);
  const hourScale = distributionHourScale(Math.max(0, ...data.map((item) => item.total)));
  const config = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  );
  return (
    <ReportWidget
      className="report-distribution"
      title={
        <span className="inline-flex items-center gap-1">
          {t("Hours distribution")}
          <Tooltip delay={0}>
            <Tooltip.Trigger aria-label={t("Hours distribution")} className="inline-flex">
              <CircleInfo className="size-3.5" aria-hidden="true" />
            </Tooltip.Trigger>
            <Tooltip.Content>
              {t("Bars show tracked time across the selected period.")}
            </Tooltip.Content>
          </Tooltip>
        </span>
      }
      contentDescription={t("Bars show tracked time across the selected period.")}
      action={
        <div className="report-distribution-actions">
          <span>{formatDistributionPeriod(analytics.period, locale)}</span>
          <Tabs
            selectedKey={mode}
            onSelectionChange={(key) => setMode(String(key))}
            aria-label={t("Hours distribution")}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={t("Hours distribution")}>
                <Tabs.Tab id="total">
                  {t("General")}
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="projects">
                  {t("By project")}
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>
      }
      isEmpty={analytics.summary.totalSeconds === 0}
      emptyState={{ title: t("No chart data") }}
    >
      <ReportChart
        config={{ total: { label: t("Tracked"), color: "var(--accent)" }, ...config }}
        summary={data
          .map((item) => `${item.label}: ${formatDuration(item.total, locale)}`)
          .join(". ")}
        height="tall"
      >
        <BarChart
          data={data}
          accessibilityLayer
          margin={{ top: 24, right: 12, left: 0, bottom: 0 }}
          barCategoryGap="18%"
        >
          <CartesianGrid vertical={false} stroke="var(--separator)" strokeOpacity={0.5} />
          <XAxis
            {...reportChartAxisProps}
            dataKey="label"
            minTickGap={20}
            tickMargin={10}
            tick={{ fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis
            {...reportChartAxisProps}
            width={52}
            tickMargin={20}
            tick={{ fontSize: 12 }}
            domain={[0, hourScale.maximum]}
            ticks={hourScale.ticks}
            tickFormatter={(value) => `${Number(value) / 3600}h`}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent valueFormatter={(value) => formatClock(Number(value ?? 0))} />
            }
          />
          {mode === "projects" ? (
            series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                stackId="projects"
                fill={item.color}
                isAnimationActive={false}
                maxBarSize={96}
                radius={index === series.length - 1 ? [6, 6, 0, 0] : 0}
              >
                {index === series.length - 1 && data.length <= 14 ? (
                  <LabelList
                    dataKey="total"
                    position="top"
                    formatter={(value: unknown) => formatClock(Number(value))}
                    fill="var(--muted)"
                    fontSize={12}
                  />
                ) : null}
              </Bar>
            ))
          ) : (
            <Bar
              dataKey="total"
              fill="var(--accent)"
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
              maxBarSize={96}
            >
              {data.length <= 14 ? (
                <LabelList
                  position="top"
                  formatter={(value: unknown) => formatClock(Number(value))}
                  fill="var(--muted)"
                  fontSize={12}
                />
              ) : null}
            </Bar>
          )}
        </BarChart>
      </ReportChart>
    </ReportWidget>
  );
}
