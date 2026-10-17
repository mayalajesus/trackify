import { Fragment, useRef, useState } from "react";
import { Button } from "@heroui/react/button";
import { Popover } from "@heroui/react/popover";
import { Input } from "@heroui/react/input";
import { TextField } from "@heroui/react/textfield";
import { Label } from "@heroui/react/label";
import { useStore, useTimerTicker } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { getLocalToday } from "@/lib/format";

export function TimerStartEditor() {
  const { timer, currentMember, preferences, setTimerStart } = useStore();
  const { elapsed } = useTimerTicker();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [clock, setClock] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const cancelEdit = useRef(false);
  const commit = () => {
    if (cancelEdit.current || readOnly || clock === timer.startClock) return true;
    const result = setTimerStart(date, clock);
    setFailure(result.success ? null : result.error);
    return result.success;
  };
  const readOnly = Boolean(
    timer.collaborationOwnerId && timer.collaborationOwnerId !== currentMember?.id,
  );
  const parts = [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map(
    (value) => String(Math.floor(value)).padStart(2, "0"),
  );
  return (
    <Popover
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) commit();
        setOpen(value);
        setFailure(null);
        if (value) {
          cancelEdit.current = false;
          setDate(timer.startedDate ?? "");
          setClock(timer.startClock);
        }
      }}
    >
      <Popover.Trigger>
        <Button
          variant="ghost"
          className="tracker-start-trigger h-auto min-w-0 p-0"
          aria-atomic="true"
          aria-label={`${t("Edit start time")}: ${parts.join(":")}`}
        >
          {parts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 ? <span aria-hidden="true">:</span> : null}
              <span className="tracker-time-digit flex items-center justify-center bg-default px-1 tabular-nums">
                {part}
              </span>
            </Fragment>
          ))}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        placement="bottom"
        offset={8}
        className="w-auto max-w-[calc(100vw-24px)] p-4"
      >
        <Popover.Dialog className="flex flex-col gap-2 p-0" aria-label={t("Edit start time")}>
          <div className="flex items-center gap-3">
            <TextField
              className="flex flex-row items-center gap-3"
              value={clock}
              onChange={setClock}
              isDisabled={readOnly}
            >
              <Label className="whitespace-nowrap text-xs font-normal uppercase text-muted">
                {t("Starting time")}
              </Label>
              <Input
                autoFocus
                inputMode="numeric"
                maxLength={5}
                className="h-8 w-16 min-w-16 rounded-md px-2 text-center text-sm tabular-nums"
                onFocus={(event) => event.currentTarget.select()}
                onBlur={() => {
                  commit();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    cancelEdit.current = true;
                    setOpen(false);
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (commit()) setOpen(false);
                  }
                }}
              />
            </TextField>
            <span className="whitespace-nowrap text-xs text-muted">
              {date === getLocalToday(new Date(), preferences.timezone)
                ? t("Today")
                : date.split("-").reverse().join("/")}
            </span>
          </div>
          {failure ? (
            <p role="alert" className="text-sm text-danger">
              {t(failure)}
            </p>
          ) : null}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
