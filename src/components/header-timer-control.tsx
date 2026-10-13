import { toast } from "@/lib/toast";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useStore, useTimerTicker } from "@/lib/store";
import { TimerActionButton } from "@/components/timer-action-button";
import { TimerDurationEditor } from "@/components/timer-duration-editor";
import { focusTimerTaskInput } from "@/lib/timer-input";

export function HeaderTimerControl() {
  const { timer, pauseTimer, resumeTimer, setTimerElapsed } = useStore();
  const navigate = useNavigate();
  const { elapsed } = useTimerTicker();
  const { t, error } = useI18n();

  const handleAction = () => {
    if (timer.status === "running") {
      pauseTimer();
      return;
    }

    if (timer.status === "paused") {
      const result = resumeTimer();
      if (!result.success) {
        toast.danger(t("We couldn't start the timer"), { description: error(result.error) });
        void navigate({ to: "/tracker" });
      }
      return;
    }

    void navigate({ to: "/tracker" }).then(() => {
      requestAnimationFrame(() => focusTimerTaskInput(t("A task is required.")));
    });
  };

  return (
    <div className="flex items-center gap-2" data-header-timer-control data-status={timer.status}>
      <TimerDurationEditor
        elapsed={elapsed}
        isReadOnly={timer.status === "idle"}
        onElapsedChange={setTimerElapsed}
      />
      <TimerActionButton status={timer.status} onPress={handleAction} />
    </div>
  );
}
