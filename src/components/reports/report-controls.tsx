import { Button } from "@heroui/react/button";

import { Tabs } from "@heroui/react/tabs";

import { ArrowUpFromSquare } from "@gravity-ui/icons";

import { useI18n } from "@/lib/i18n";

import { type ReportView } from "@/lib/report-views";

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
