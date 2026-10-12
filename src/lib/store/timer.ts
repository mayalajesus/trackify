import type { TimerState } from "./types";

export function elapsedForTimer(timer: TimerState, now = Date.now()): number {
  if (timer.status !== "running" || timer.startedAt === null) return timer.accumulated;
  return Math.max(0, timer.accumulated + Math.floor((now - timer.startedAt) / 1000));
}

export function pauseTimerAt(timer: TimerState, effectiveAt = Date.now()): TimerState {
  if (timer.status !== "running") return timer;
  const now = Date.now();
  const requestedAt = Number.isFinite(effectiveAt) ? effectiveAt : now;
  const pauseAt = Math.max(timer.startedAt ?? requestedAt, Math.min(requestedAt, now));
  return {
    ...timer,
    status: "paused",
    accumulated: elapsedForTimer(timer, pauseAt),
    startedAt: null,
  };
}
