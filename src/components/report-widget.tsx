import { Alert } from "@heroui/react/alert";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Spinner } from "@heroui/react/spinner";
import { Typography } from "@heroui/react/typography";
import { ArrowDown, ArrowUp, Minus } from "@gravity-ui/icons";
import { useId, type ComponentProps, type ReactNode } from "react";
import { BillableIndicator } from "./billable-indicator";
import type { ChartConfig } from "./ui/chart";
import { ChartContainer } from "./ui/chart";
import { cn } from "../lib/utils";

export type ReportWidgetWidth = "compact" | "medium" | "full";

export type ReportWidgetMessage = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export type ReportWidgetProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  isEmpty?: boolean;
  emptyState?: ReportWidgetMessage;
  error?: ReportWidgetMessage | null;
  width?: ReportWidgetWidth;
  className?: string;
  contentDescription: string;
};

const widgetWidthClassNames: Record<ReportWidgetWidth, string> = {
  compact: "min-w-0",
  medium: "min-w-0 md:col-span-2 lg:col-span-2",
  full: "min-w-0 md:col-span-2 lg:col-span-3",
};

function WidgetMessage({ message }: { message: ReportWidgetMessage }) {
  return (
    <div
      className="flex min-h-36 w-full flex-col items-center justify-center gap-2 px-4 py-6 text-center"
      role="status"
    >
      <Typography type="body-sm" weight="semibold">
        {message.title}
      </Typography>
      {message.description ? (
        <Typography type="body-sm" color="muted" className="max-w-md">
          {message.description}
        </Typography>
      ) : null}
      {message.action}
    </div>
  );
}

export function ReportWidget({
  title,
  description,
  action,
  children,
  loading = false,
  loadingLabel = "Loading data",
  isEmpty = false,
  emptyState = { title: "No data available" },
  error = null,
  width = "compact",
  className,
  contentDescription,
}: ReportWidgetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const contentDescriptionId = useId();
  const accessibleDescriptions = [description ? descriptionId : null, contentDescriptionId]
    .filter(Boolean)
    .join(" ");

  return (
    <Card
      className={cn("report-widget min-w-0 gap-4 p-4", widgetWidthClassNames[width], className)}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={accessibleDescriptions}
      aria-busy={loading || undefined}
    >
      <Card.Header className="flex-row items-start justify-between gap-4 p-0">
        <div className="min-w-0 space-y-1">
          <Card.Title id={titleId}>{title}</Card.Title>
          {description ? (
            <Card.Description id={descriptionId}>{description}</Card.Description>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </Card.Header>
      <Card.Content className="min-w-0 p-0" aria-describedby={contentDescriptionId}>
        <Typography id={contentDescriptionId} type="body-sm" className="sr-only">
          {contentDescription}
        </Typography>
        {error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{error.title}</Alert.Title>
              {error.description ? (
                <Alert.Description>{error.description}</Alert.Description>
              ) : null}
              {error.action}
            </Alert.Content>
          </Alert>
        ) : loading ? (
          <div
            className="flex min-h-36 flex-col items-center justify-center gap-3 px-4 py-6 text-center"
            role="status"
            aria-live="polite"
          >
            <Spinner aria-hidden="true" />
            <Typography type="body-sm" color="muted">
              {loadingLabel}
            </Typography>
          </div>
        ) : isEmpty ? (
          <WidgetMessage message={emptyState} />
        ) : (
          children
        )}
      </Card.Content>
    </Card>
  );
}

export function ReportWidgetGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function ReportTableWidget(props: Omit<ReportWidgetProps, "width">) {
  return <ReportWidget {...props} width="full" />;
}

export type ReportKpiVariation = {
  label: string;
  accessibleLabel: string;
  direction: "up" | "down" | "neutral";
  tone?: "positive" | "negative" | "neutral";
};

export type ReportKpiProps = Omit<ReportWidgetProps, "children"> & {
  value: ReactNode;
  secondaryInformation?: ReactNode;
  variation?: ReportKpiVariation | null;
  neutralComparisonLabel?: string;
  showNeutralComparison?: boolean;
  comparisonContext?: ReactNode;
};

function KpiVariation({
  variation,
  neutralLabel,
}: {
  variation: ReportKpiVariation | null | undefined;
  neutralLabel: string;
}) {
  if (!variation) {
    return (
      <Chip size="sm" variant="soft" color="default" aria-label={neutralLabel}>
        <Minus aria-hidden="true" className="size-3" />
        <Chip.Label>{neutralLabel}</Chip.Label>
      </Chip>
    );
  }

  const Icon =
    variation.direction === "up" ? ArrowUp : variation.direction === "down" ? ArrowDown : Minus;
  const color =
    variation.tone === "positive"
      ? "success"
      : variation.tone === "negative"
        ? "danger"
        : "default";

  return (
    <Chip size="sm" variant="soft" color={color} aria-label={variation.accessibleLabel}>
      <Icon aria-hidden="true" className="size-3" />
      <Chip.Label>{variation.label}</Chip.Label>
    </Chip>
  );
}

export function ReportKpi({
  value,
  secondaryInformation,
  variation,
  neutralComparisonLabel = "No comparison",
  showNeutralComparison = true,
  comparisonContext,
  width = "compact",
  ...widgetProps
}: ReportKpiProps) {
  return (
    <ReportWidget
      {...widgetProps}
      width={width}
      className={cn("report-kpi", widgetProps.className)}
    >
      <div className="space-y-3">
        <Typography type="h2" weight="semibold">
          {value}
        </Typography>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {secondaryInformation ? (
            <Typography type="body-sm" color="muted">
              {secondaryInformation}
            </Typography>
          ) : null}
          {variation || showNeutralComparison ? (
            <div className={comparisonContext ? "flex items-center gap-2" : "ml-auto"}>
              <KpiVariation variation={variation} neutralLabel={neutralComparisonLabel} />
              {comparisonContext ? (
                <Typography type="body-xs" color="muted">
                  {comparisonContext}
                </Typography>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </ReportWidget>
  );
}

export type ReportChartHeight = "compact" | "standard" | "tall";

const chartHeightClassNames: Record<ReportChartHeight, string> = {
  compact: "h-[180px]",
  standard: "h-[210px]",
  tall: "h-[240px]",
};

export const reportChartColors = {
  accent: "var(--accent)",
  neutral: "var(--default)",
  foreground: "var(--foreground)",
  muted: "var(--muted)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
} as const;

export const reportVerticalBarProps = {
  barSize: 8,
  radius: [4, 4, 0, 0] as [number, number, number, number],
  isAnimationActive: false,
  activeBar: false,
} as const;

export const reportHorizontalBarProps = {
  barSize: 10,
  radius: [0, 4, 4, 0] as [number, number, number, number],
  isAnimationActive: false,
  activeBar: false,
} as const;

export const reportChartTooltipProps = { cursor: false } as const;
export const reportChartAxisProps = { axisLine: false, tickLine: false } as const;
export const reportChartGridProps = { vertical: false, strokeDasharray: "3 3" } as const;
export const reportChartAnimationProps = { isAnimationActive: false } as const;
export const reportChartCategoryLimits = { compact: 6, default: 8 } as const;

export function shortenReportChartLabel(value: unknown, maximumLength = 12): string {
  const label = String(value ?? "");
  if (label.length <= maximumLength) return label;
  return `${label.slice(0, Math.max(1, maximumLength - 1))}…`;
}

export function limitReportChartCategories<T>(
  data: readonly T[],
  maximum: 6 | 8 = reportChartCategoryLimits.default,
): T[] {
  return data.slice(0, maximum);
}

export type ReportChartLegendItem = {
  key: string;
  label: ReactNode;
  tone?: "accent" | "danger" | "default" | "success" | "warning";
  billable?: boolean;
};

export function ReportChartLegend({
  items,
  accessibleLabel = "Chart legend",
  variant = "soft",
}: {
  items: readonly ReportChartLegendItem[];
  accessibleLabel?: string;
  variant?: ComponentProps<typeof Chip>["variant"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={accessibleLabel}>
      {items.slice(0, reportChartCategoryLimits.default).map((item) =>
        item.billable === undefined ? (
          <Chip key={item.key} size="sm" variant={variant} color={item.tone ?? "default"}>
            <Chip.Label>{item.label}</Chip.Label>
          </Chip>
        ) : (
          <BillableIndicator key={item.key} billable={item.billable} />
        ),
      )}
    </div>
  );
}

export type ReportChartProps = {
  config: ChartConfig;
  children: ComponentProps<typeof ChartContainer>["children"];
  summary: string;
  height?: ReportChartHeight;
  legend?: ReactNode;
  legendPlacement?: "before-chart" | "after-chart";
  isEmpty?: boolean;
  emptyState?: ReactNode;
};

export function ReportChart({
  config,
  children,
  summary,
  height = "standard",
  legend,
  legendPlacement = "after-chart",
  isEmpty = false,
  emptyState,
}: ReportChartProps) {
  const summaryId = useId();

  if (isEmpty) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center px-4 text-center",
          chartHeightClassNames[height],
        )}
        role="status"
      >
        {emptyState ?? (
          <Typography type="body-sm" color="muted">
            No chart data
          </Typography>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" role="img" aria-describedby={summaryId}>
      {legendPlacement === "before-chart" ? legend : null}
      <ChartContainer
        config={config}
        className={cn("w-full aspect-auto", chartHeightClassNames[height])}
        aria-hidden="true"
      >
        {children}
      </ChartContainer>
      {legendPlacement === "after-chart" ? legend : null}
      <Typography id={summaryId} type="body-sm" className="sr-only">
        {summary}
      </Typography>
    </div>
  );
}

export type ReportChartWidgetProps = Omit<ReportWidgetProps, "children"> &
  Omit<ReportChartProps, "isEmpty" | "emptyState">;

export function ReportChartWidget({
  config,
  children,
  summary,
  height,
  legend,
  legendPlacement,
  width = "medium",
  ...widgetProps
}: ReportChartWidgetProps) {
  return (
    <ReportWidget {...widgetProps} width={width}>
      <ReportChart
        config={config}
        summary={summary}
        {...(height ? { height } : {})}
        {...(legend ? { legend } : {})}
        {...(legendPlacement ? { legendPlacement } : {})}
      >
        {children}
      </ReportChart>
    </ReportWidget>
  );
}
