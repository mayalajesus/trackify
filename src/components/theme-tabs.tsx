import { Tabs } from "@heroui/react/tabs";
import { Display, Moon, Sun } from "@gravity-ui/icons";
import { useI18n } from "@/lib/i18n";
import type { ThemeMode } from "@/lib/store";

const options = [
  { id: "system", label: "System", Icon: Display },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
] as const;

export function ThemeTabs({
  value,
  onChange,
  icons = false,
  isDisabled = false,
}: {
  value: ThemeMode;
  onChange: (theme: ThemeMode) => void;
  icons?: boolean;
  isDisabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Tabs
      className={`theme-tabs ${icons ? "theme-tabs--icons" : "theme-tabs--text"}`}
      selectedKey={value}
      onSelectionChange={(key) => onChange(key as ThemeMode)}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={t("Theme")}>
          {options.map(({ id, label, Icon }) => (
            <Tabs.Tab key={id} id={id} aria-label={t(label)} isDisabled={isDisabled}>
              {icons ? <Icon aria-hidden="true" className="size-[17px]" /> : t(label)}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
