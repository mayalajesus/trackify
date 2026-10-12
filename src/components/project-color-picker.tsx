import { ColorArea } from "@heroui/react/color-area";
import { ColorField } from "@heroui/react/color-field";
import { ColorPicker } from "@heroui/react/color-picker";
import { ColorSlider } from "@heroui/react/color-slider";
import { ColorSwatchPicker } from "@heroui/react/color-swatch-picker";
import { Label } from "@heroui/react/label";
import { parseColor } from "@heroui/react/rac";
import { useI18n } from "@/lib/i18n";
import { projectColorOptions, projectColorValue } from "@/lib/project-colors";

export function ProjectColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const color = parseColor(projectColorValue(value));
  const isCustom = !projectColorOptions.some(
    (option) => option.value.toLowerCase() === color.toString("hex").toLowerCase(),
  );

  return (
    <div className="space-y-2">
      <Label>{t("Project color")}</Label>
      <div className="flex flex-wrap items-center gap-2.5">
        <ColorSwatchPicker
          aria-label={t("Project color")}
          className="gap-2.5"
          value={color}
          onChange={(next) => onChange(typeof next === "string" ? next : next.toString("hex"))}
        >
          {projectColorOptions.map((option) => (
            <ColorSwatchPicker.Item
              key={option.id}
              color={parseColor(option.value)}
              aria-label={t(option.label)}
              className="size-7 rounded-full"
            >
              <ColorSwatchPicker.Swatch />
              <ColorSwatchPicker.Indicator />
            </ColorSwatchPicker.Item>
          ))}
        </ColorSwatchPicker>
        <ColorPicker value={color} onChange={(next) => onChange(next.toString("hex"))}>
          <ColorPicker.Trigger
            aria-label={t("Choose a custom project color")}
            className="flex size-7 min-w-7 items-center justify-center rounded-full border border-separator bg-surface p-1 text-foreground"
            {...(isCustom
              ? { style: { borderColor: value, boxShadow: `0 0 0 2px ${value}` } }
              : {})}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="m16 3 5 5M14.5 8.5l-10 10L3 22l3.5-1.5 10-10M13 7l4 4M15 5l2-2a2.8 2.8 0 0 1 4 4l-2 2" />
            </svg>
          </ColorPicker.Trigger>
          <ColorPicker.Popover
            placement="bottom end"
            className="w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-4"
          >
            <div
              role="dialog"
              aria-label={t("Choose a custom project color")}
              className="space-y-3"
            >
              <ColorArea
                colorSpace="hsb"
                xChannel="saturation"
                yChannel="brightness"
                aria-label={t("Saturation and brightness")}
                className="h-36 w-full rounded-lg"
              >
                <ColorArea.Thumb />
              </ColorArea>
              <ColorSlider colorSpace="hsb" channel="hue" aria-label={t("Hue")}>
                <ColorSlider.Track>
                  <ColorSlider.Thumb />
                </ColorSlider.Track>
              </ColorSlider>
              <ColorField aria-label={t("Hex color")}>
                <Label>{t("Hex color")}</Label>
                <ColorField.Group>
                  <ColorField.Input />
                </ColorField.Group>
              </ColorField>
            </div>
          </ColorPicker.Popover>
        </ColorPicker>
      </div>
    </div>
  );
}
