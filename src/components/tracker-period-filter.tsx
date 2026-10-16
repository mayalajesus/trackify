import { useState } from "react";
import { ReportPeriodPicker } from "@/components/report-filters";
import {
  formatCompactDateRange,
  formatTrackerPeriodLabel,
  getReportPeriodRange,
  getWeekBounds,
  reportPeriodPresets,
  type ReportPeriodPreset,
  type TrackerPeriod,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function TrackerPeriodFilter({
  period,
  today,
  weekStartsOn,
  onChange,
}: {
  period: TrackerPeriod;
  today: string;
  weekStartsOn: 0 | 1;
  onChange: (period: TrackerPeriod) => void;
}) {
  const { locale, t } = useI18n();
  const [selection, setSelection] = useState<{
    preset: ReportPeriodPreset;
    period: TrackerPeriod;
  } | null>(null);
  const sameSelection = selection?.period === period;
  const inferredPreset =
    period.unit === "custom"
      ? undefined
      : reportPeriodPresets.find((option) => {
          if (option.id === "custom") return false;
          const range = getReportPeriodRange(option.id, today, weekStartsOn);
          return range.startDate === period.startDate && range.endDate === period.endDate;
        })?.id;
  const preset = sameSelection ? selection.preset : (inferredPreset ?? "custom");
  const presetLabel = reportPeriodPresets.find((option) => option.id === preset)?.label;
  const displayLabel =
    preset !== "custom" && presetLabel
      ? t(presetLabel)
      : period.unit === "custom" || period.unit === "week"
        ? formatCompactDateRange(period.startDate, period.endDate, locale)
        : t(formatTrackerPeriodLabel(period, today, weekStartsOn, locale));

  return (
    <ReportPeriodPicker
      preset={preset}
      range={period}
      today={today}
      weekStartsOn={weekStartsOn}
      trackerTriggerLabel={displayLabel}
      onChange={(nextPreset, range) => {
        const week = getWeekBounds(range.startDate, weekStartsOn);
        const nextPeriod: TrackerPeriod = {
          ...range,
          unit:
            range.startDate === range.endDate
              ? "day"
              : week.start === range.startDate && week.end === range.endDate
                ? "week"
                : "custom",
        };
        setSelection({ preset: nextPreset, period: nextPeriod });
        onChange(nextPeriod);
      }}
    />
  );
}
