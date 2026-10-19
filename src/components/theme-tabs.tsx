import { SegmentedControl } from "./segmented-control";
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
    <SegmentedControl
      className={`theme-tabs ${icons ? "theme-tabs--icons" : "theme-tabs--text"}`}
      value={value}
      onChange={onChange}
      label={t("Theme")}
      isDisabled={isDisabled}
      options={options.map(({ id, label, Icon }) => ({
        value: id,
        label: t(label),
        content: icons ? <Icon aria-hidden="true" className="size-[17px]" /> : t(label),
      }))}
    />
  );
}
