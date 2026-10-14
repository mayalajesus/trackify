import { IconTooltip } from "@/components/icon-tooltip";
import { Button } from "@heroui/react/button";
import { Pause, Play } from "@gravity-ui/icons";
import type { TimerStatus } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

interface TimerActionButtonProps {
  status: TimerStatus;
  onPress: () => void;
}

export function TimerActionButton({ status, onPress }: TimerActionButtonProps) {
  const { t } = useI18n();
  const isRunning = status === "running";
  const actionLabel = isRunning ? t("Pause") : status === "paused" ? t("Resume") : t("Start");

  return (
    <IconTooltip>
      <Button
        aria-label={actionLabel}
        isIconOnly
        size="sm"
        variant={isRunning ? "secondary" : "primary"}
        className="size-9 min-h-9 min-w-9 shrink-0"
        onPress={onPress}
      >
        {isRunning ? (
          <Pause aria-hidden="true" className="text-foreground" />
        ) : (
          <Play aria-hidden="true" />
        )}
      </Button>
    </IconTooltip>
  );
}
