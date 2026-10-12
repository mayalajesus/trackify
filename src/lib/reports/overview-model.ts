import type { Client, Project } from "@/lib/domain";
import { getDayOffset } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { type ReportAnalytics, type ShiftId, type TemporalBucket } from "@/lib/report-analytics";

export const shiftLabels: Record<ShiftId, string> = {
  overnight: "Overnight",
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};

export const shiftEmoji: Record<ShiftId, string> = {
  overnight: "🦇",
  morning: "☀️",
  afternoon: "🌤️",
  night: "🌑",
};

export function formatOverviewBucket(
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

export function formatOverviewAxisBucket(
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

export function formatOverviewTooltipBucket(
  bucket: Pick<TemporalBucket, "startDate" | "endDate" | "granularity">,
  locale: Locale,
): string {
  const label = formatOverviewBucket(bucket, locale);
  if (bucket.granularity !== "day") return label;
  const date = new Date(`${bucket.startDate}T12:00:00`);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return `${label} · ${weekday}`;
}

export function overviewEvolutionRows(analytics: ReportAnalytics, locale: Locale) {
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

export function isWeekdayDate(date: string): boolean {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function overviewActivityTime(analytics: ReportAnalytics) {
  const periodSeconds =
    (getDayOffset(analytics.period.startDate, analytics.period.endDate) + 1) * 24 * 60 * 60;
  return {
    periodSeconds,
    percentage: periodSeconds > 0 ? (analytics.summary.totalSeconds / periodSeconds) * 100 : 0,
  };
}

export function overviewWeekdayRows(analytics: ReportAnalytics, locale: Locale) {
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

export function overviewConsistencyPercentage(analytics: ReportAnalytics): number {
  const periodDays = Math.max(
    1,
    getDayOffset(analytics.period.startDate, analytics.period.endDate) + 1,
  );
  return (analytics.summary.activeDays / periodDays) * 100;
}

export function selectTopProjects(analytics: ReportAnalytics, maximum = 5) {
  const noProject = analytics.summary.projectBreakdown.find((item) => item.id === "none");
  const projects = analytics.summary.projectBreakdown.filter((item) => item.id !== "none");
  const selected = noProject
    ? [...projects.slice(0, Math.max(0, maximum - 1)), noProject]
    : projects.slice(0, maximum);
  return selected.sort(
    (first, second) => second.seconds - first.seconds || first.label.localeCompare(second.label),
  );
}

export function overviewProjectRows(
  analytics: ReportAnalytics,
  projects: Project[],
  clients: Client[],
) {
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
