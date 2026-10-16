import type { DateRange } from "./format";
import type { TimerState } from "./store/types";

export function trackerPeriodTotal(
  savedSeconds: number,
  timer: TimerState,
  elapsed: number,
  period: DateRange,
  workspaceId: string,
  today: string,
): number {
  // Use the same entry date that stopping the timer will persist, including overnight tasks.
  const date = timer.startedDate ?? today;
  if (
    timer.status === "idle" ||
    timer.workspaceId !== workspaceId ||
    date < period.startDate ||
    date > period.endDate
  ) {
    return savedSeconds;
  }
  return savedSeconds + Math.max(0, Number.isFinite(elapsed) ? Math.floor(elapsed) : 0);
}
