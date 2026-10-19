import { useI18n } from "@/lib/i18n";
import { type ReportView } from "@/lib/report-views";
import { ArrowUpFromSquare } from "@gravity-ui/icons";
import { Button } from "@heroui/react/button";
import { SegmentedControl } from "../segmented-control";

export function ReportExportButton({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Button variant="primary" onPress={onPress}>
      <ArrowUpFromSquare aria-hidden="true" className="size-4" />
      {t("Export")}
    </Button>
  );
}

export function ReportViewSwitcher({
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
    <SegmentedControl
      className="max-w-full shrink-0"
      itemClassName="min-w-max whitespace-nowrap px-3 sm:px-4 md:h-7"
      value={value}
      onChange={onChange}
      label={t("Report views")}
      options={options.map((option) => ({ value: option.value, label: t(option.label) }))}
    />
  );
}
