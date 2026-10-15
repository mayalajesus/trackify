import { IconTooltip } from "@/components/icon-tooltip";
import { Button } from "@heroui/react/button";
import { Pause, Play } from "@gravity-ui/icons";
import type { TimerStatus } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

interface TimerActionButtonProps {
  status: TimerStatus;
  onPress: () => void;
}

export function TimerActionButton({ status, onPress }: TimerActionButtonProps) {
  const { t } = useI18n();
  const { timer, currentMember } = useStore();
  const isParticipant = Boolean(
    status !== "idle" &&
    timer.collaborationOwnerId &&
    timer.collaborationOwnerId !== currentMember?.id,
  );
  const isRunning = status === "running";
  const actionLabel = isRunning ? t("Pause") : status === "paused" ? t("Resume") : t("Start");

  return (
    <IconTooltip>
      <Button
        aria-label={
          isParticipant
            ? t("Only the person who started this shared task can pause or resume it.")
            : actionLabel
        }
        isDisabled={isParticipant}
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
