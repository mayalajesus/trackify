import { request } from "../api-data-source";
import type { TimeEntry } from "../domain";
import { addSecondsToDateTime, dateTimeToTimestamp, getLocalToday, nowTime } from "../format";
import {
  createRunningTimer,
  validateTimerDetails,
  validateTimerTaskStart,
  type TimerTaskPreset,
} from "../timer-start";
import { initialTimer } from "./defaults";
import { nextId } from "./ids";
import { elapsedForTimer, pauseTimerAt } from "./timer";
import type { StoreResult, TimerState } from "./types";

export function createTimerActions({
  acceptingTaskRef,
  timerRef,
  timerSyncPromiseRef,
  accountScopeRef,
  accountScope,
  timerWorkspaceRef,
  activeWorkspaceId,
  timerRevisionRef,
  persistedTimerRef,
  setTimer,
  setElapsed,
  workspaceCreationRef,
  can,
  validateProjectId,
  billableForProject,
  preferences,
  workspaceBilling,
  currencyForProject,
  projects,
  canTrackProject,
  activeMemberId,
  setEntries,
}: {
  acceptingTaskRef: React.RefObject<boolean>;
  timerRef: React.RefObject<import("@/lib/store/types").TimerState>;
  timerSyncPromiseRef: React.RefObject<Promise<void> | null>;
  accountScopeRef: React.RefObject<{ userId: string; reloadKey: number }>;
  accountScope: { userId: string; reloadKey: number };
  timerWorkspaceRef: React.RefObject<string>;
  activeWorkspaceId: string;
  timerRevisionRef: React.RefObject<number>;
  persistedTimerRef: React.RefObject<{
    scope: { userId: string; reloadKey: number };
    workspaceId: string;
    value: string;
  } | null>;
  setTimer: React.Dispatch<React.SetStateAction<import("@/lib/store/types").TimerState>>;
  setElapsed: React.Dispatch<React.SetStateAction<number>>;
  workspaceCreationRef: React.RefObject<{
    scope: { userId: string; reloadKey: number };
    promise: Promise<import("@/lib/store/types").StoreResult>;
  } | null>;
  can: (permission: import("@/lib/permissions").Permission) => boolean;
  validateProjectId: (
    projectId: string | null,
    allowUnassigned?: boolean,
  ) => import("@/lib/store/types").StoreResult;
  billableForProject: (projectId: string | null) => boolean;
  preferences: import("@/lib/account-types").UserPreferences;
  workspaceBilling: import("@/lib/billing").BillingPreference;
  currencyForProject: (projectId: string | null) => "BRL" | "USD" | "EUR" | "GBP";
  projects: import("@/lib/domain").Project[];
  canTrackProject: (projectId: string) => boolean;
  activeMemberId: string;
  setEntries: React.Dispatch<React.SetStateAction<import("@/lib/domain").TimeEntry[]>>;
}) {
  const acceptTaskInvitation = async (invitationId: string): Promise<StoreResult> => {
    if (acceptingTaskRef.current)
      return {
        success: false,
        error: "Stop the active timer before accepting a task invitation.",
      };
    acceptingTaskRef.current = true;
    try {
      await timerSyncPromiseRef.current;
      if (
        accountScopeRef.current !== accountScope ||
        timerWorkspaceRef.current !== activeWorkspaceId
      )
        return {
          success: false,
          error: "Stop the active timer before accepting a task invitation.",
        };
      const result = await request<{ timer: TimerState | null; entries?: TimeEntry[] }>(
        "respondTaskInvitation",
        {
          workspaceId: activeWorkspaceId,
          invitationId,
          response: "accepted",
        },
      );
      if (!result.success) return result;
      if (
        accountScopeRef.current !== accountScope ||
        timerWorkspaceRef.current !== activeWorkspaceId
      )
        return { success: true };
      if (!result.data.timer) {
        const received = result.data.entries ?? [];
        setEntries((entries) => [
          ...entries.filter((entry) => !received.some((item) => item.id === entry.id)),
          ...received,
        ]);
        return { success: true };
      }
      timerRevisionRef.current += 1;
      timerRef.current = result.data.timer;
      persistedTimerRef.current = {
        scope: accountScope,
        workspaceId: activeWorkspaceId,
        value: JSON.stringify(result.data.timer),
      };
      setTimer(result.data.timer);
      setElapsed(elapsedForTimer(result.data.timer));
      return { success: true };
    } finally {
      acceptingTaskRef.current = false;
    }
  };

  const startTimer = (
    task: string,
    projectId: string | null,
    _billable?: boolean,
    taskDetails?: import("../domain").TaskDetails,
  ): StoreResult => {
    if (workspaceCreationRef.current?.scope === accountScope)
      return { success: false, error: "Wait for workspace creation to finish." };
    if (!can("track-own-time")) return { success: false, error: "Your account cannot track time." };
    if (timerRef.current.status !== "idle")
      return { success: false, error: "Stop the active timer before starting another one." };
    const projectValidation = validateProjectId(projectId);
    if (!projectValidation.success) return projectValidation;
    if (acceptingTaskRef.current)
      return { success: false, error: "Wait for the task invitation to finish." };
    const projectDefault = billableForProject(projectId);
    const now = Date.now();
    const next = createRunningTimer(
      { task, projectId, billable: projectDefault },
      {
        workspaceId: activeWorkspaceId,
        now,
        startedDate: getLocalToday(new Date(now), preferences.timezone),
        startClock: nowTime(preferences.timezone, new Date(now)),
        hourlyRate: workspaceBilling.hourlyRate,
        currency: currencyForProject(projectId),
      },
    );
    timerRevisionRef.current += 1;

    if (taskDetails) next.taskDetails = taskDetails;
    timerRef.current = next;
    setElapsed(0);
    setTimer(next);
    return { success: true };
  };

  const startTimerFromTask = (task: TimerTaskPreset): StoreResult => {
    const validation = validateTimerTaskStart(task, {
      timerStatus: timerRef.current.status,
      projects,
      canUseProject: canTrackProject,
    });
    if (!validation.success) return validation;
    return startTimer(
      validation.preset.task,
      validation.preset.projectId,
      validation.preset.billable,
      task.taskDetails,
    );
  };

  const updateTimer = (patch: {
    taskDetails?: import("../domain").TaskDetails;
    task?: string;
    projectId?: string | null;
    billable?: boolean;
  }): StoreResult => {
    if (!can("track-own-time"))
      return { success: false, error: "Your account cannot update the active timer." };
    const current = timerRef.current;
    if (current.status === "idle")
      return { success: false, error: "There is no active timer to update." };
    if (patch.projectId === null)
      return { success: false, error: "Select a project before starting the timer." };
    if (patch.projectId !== undefined) {
      const projectValidation = validateProjectId(patch.projectId);
      if (!projectValidation.success) return projectValidation;
    }
    if (patch.task !== undefined && !patch.task.trim())
      return { success: false, error: "A task is required." };
    const next = {
      ...current,
      ...patch,
      billable: billableForProject(patch.projectId ?? current.projectId),
      ...(patch.task !== undefined ? { task: patch.task.trim() } : {}),
      ...(patch.projectId !== undefined && patch.projectId !== current.projectId
        ? { currency: currencyForProject(patch.projectId) }
        : {}),
    };
    if (
      next.task === current.task &&
      next.projectId === current.projectId &&
      next.billable === current.billable &&
      next.taskDetails === current.taskDetails
    )
      return { success: true };
    timerRevisionRef.current += 1;

    timerRef.current = next;
    setTimer(next);
    return { success: true };
  };

  const setTimerElapsed = (seconds: number): StoreResult => {
    if (!can("track-own-time"))
      return { success: false, error: "Your account cannot update the active timer." };
    const current = timerRef.current;
    if (current.status === "idle")
      return { success: false, error: "There is no active timer to update." };
    if (!Number.isFinite(seconds) || seconds < 0)
      return { success: false, error: "Enter a valid timer duration." };

    const nextElapsed = Math.floor(seconds);
    const next = {
      ...current,
      accumulated: nextElapsed,
      startedAt: current.status === "running" ? Date.now() : null,
    };
    timerRevisionRef.current += 1;

    timerRef.current = next;
    setElapsed(nextElapsed);
    setTimer(next);
    return { success: true };
  };

  const setTimerStart = (date: string, clock: string): StoreResult => {
    const current = timerRef.current;
    if (!can("track-own-time") || current.status === "idle" || !current.startedDate)
      return { success: false, error: "Your account cannot update the active timer." };
    if (current.collaborationOwnerId && current.collaborationOwnerId !== activeMemberId)
      return { success: false, error: "Only the creator can change this shared time entry." };
    const now = Date.now();
    const start = dateTimeToTimestamp(date, clock, 0, preferences.timezone);
    const previous = dateTimeToTimestamp(
      current.startedDate,
      current.startClock,
      0,
      preferences.timezone,
    );
    if (start === null || previous === null)
      return { success: false, error: "Enter a valid start time before the current time." };
    const seconds = Math.floor(elapsedForTimer(current, now) + (previous - start) / 1000);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(seconds) ||
      start > now ||
      seconds < 0 ||
      seconds > 3599999
    )
      return { success: false, error: "Enter a valid start time before the current time." };
    const next = {
      ...current,
      startedDate: date,
      startClock: clock,
      accumulated: seconds,
      startedAt: current.status === "running" ? now : null,
    };
    timerRevisionRef.current += 1;
    timerRef.current = next;
    setTimer(next);
    setElapsed(seconds);
    return { success: true };
  };

  const pauseTimer = (effectiveAt?: number) => {
    const current = timerRef.current;
    if (current.collaborationOwnerId && current.collaborationOwnerId !== activeMemberId) return;
    if (current.status !== "running") return;
    const next = pauseTimerAt(current, effectiveAt);
    timerRevisionRef.current += 1;

    timerRef.current = next;
    setElapsed(next.accumulated);
    setTimer(next);
  };

  const resumeTimer = (): StoreResult => {
    const current = timerRef.current;
    if (current.collaborationOwnerId && current.collaborationOwnerId !== activeMemberId)
      return {
        success: false,
        error: "Only the person who started this shared task can pause or resume it.",
      };
    if (current.status !== "paused" || current.workspaceId !== activeWorkspaceId)
      return { success: false, error: "There is no paused timer to resume." };
    const projectValidation = validateProjectId(current.projectId);
    if (!projectValidation.success) return projectValidation;
    const next = { ...current, status: "running" as const, startedAt: Date.now() };
    timerRevisionRef.current += 1;

    timerRef.current = next;
    setTimer(next);
    return { success: true };
  };

  const stopTimer = (): StoreResult => {
    const current = timerRef.current;
    if (current.collaborationOwnerId && current.collaborationOwnerId !== activeMemberId)
      return { success: false, error: "Only the person who started this shared task can stop it." };
    if (current.status === "idle" || current.workspaceId !== activeWorkspaceId)
      return { success: false, error: "There is no active timer to stop." };
    const details = validateTimerDetails(current.task, current.projectId);
    if (!details.success) {
      pauseTimer();
      return details;
    }
    const projectValidation = validateProjectId(current.projectId);
    if (!projectValidation.success) return projectValidation;
    const total = elapsedForTimer(current);
    const startedDate = current.startedDate ?? getLocalToday(new Date(), preferences.timezone);
    if (total > 0) {
      const startTimestamp =
        current.status === "running" && current.accumulated === 0
          ? current.startedAt
          : dateTimeToTimestamp(startedDate, current.startClock, 0, preferences.timezone);
      const endTimestamp = startTimestamp === null ? null : startTimestamp + total * 1000;
      const finish =
        endTimestamp === null
          ? addSecondsToDateTime(startedDate, current.startClock, total)
          : {
              end: nowTime(preferences.timezone, new Date(endTimestamp)),
              endDate: getLocalToday(new Date(endTimestamp), preferences.timezone),
            };
      const stoppedEntry: Omit<TimeEntry, "id"> = {
        date: startedDate,
        start: current.startClock,
        end: finish.end,
        ...(finish.endDate !== startedDate ? { endDate: finish.endDate } : {}),
        ...(startTimestamp !== null ? { startTimestamp } : {}),
        ...(endTimestamp !== null ? { endTimestamp } : {}),
        seconds: total,
        userId: activeMemberId,
        projectId: current.projectId,
        task: current.task,
        ...(current.taskDetails?.description
          ? { description: current.taskDetails.description }
          : {}),
        billable: billableForProject(current.projectId),
        ...(current.taskDetails ? { taskDetails: current.taskDetails } : {}),
        hourlyRate: current.hourlyRate ?? workspaceBilling.hourlyRate,
        currency: current.currency ?? workspaceBilling.currency,
      };
      setEntries((list) => [
        {
          ...stoppedEntry,
          id: nextId(
            "t",
            list.map((entry) => entry.id),
          ),
        },
        ...list,
      ]);
    }
    timerRevisionRef.current += 1;

    timerRef.current = initialTimer;
    setTimer(initialTimer);
    setElapsed(0);
    return {
      success: true,
    };
  };
  return {
    acceptTaskInvitation,
    startTimer,
    startTimerFromTask,
    updateTimer,
    setTimerElapsed,
    setTimerStart,
    pauseTimer,
    resumeTimer,
    stopTimer,
  };
}
