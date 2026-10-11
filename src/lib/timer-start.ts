import type { Project, TimeEntry } from "./domain";
import type { TimerState, TimerStatus } from "./store";
import type { BillingPreference } from "./billing";

export type TimerTaskPreset = Pick<TimeEntry, "task" | "projectId" | "billable"> & {
  taskDetails?: TimeEntry["taskDetails"];
  favorite?: boolean;
};

type TimerStartValidation =
  | { success: true; preset: Pick<TimerTaskPreset, "task" | "projectId" | "billable"> }
  | { success: false; error: string };

export function validateTimerDetails(task: string, projectId: string | null) {
  if (!task.trim()) return { success: false as const, error: "A task is required." };
  if (!projectId?.trim())
    return { success: false as const, error: "Select a project before starting the timer." };
  return { success: true as const };
}

export function validateTimerTaskStart(
  preset: TimerTaskPreset,
  context: {
    timerStatus: TimerStatus;
    projects: readonly Project[];
    canUseProject: (projectId: string) => boolean;
  },
): TimerStartValidation {
  if (context.timerStatus !== "idle") {
    return { success: false, error: "Stop the active timer before starting another one." };
  }
  const details = validateTimerDetails(preset.task, preset.projectId);
  if (!details.success) return details;

  if (preset.projectId !== null) {
    const project = context.projects.find((candidate) => candidate.id === preset.projectId);
    if (!project) return { success: false, error: "This project no longer exists." };
    if (project.status === "archived") {
      return {
        success: false,
        error: "This project is archived and cannot be used to start a timer.",
      };
    }
    if (project.status !== "active") {
      return {
        success: false,
        error: "This project is inactive and cannot be used to start a timer.",
      };
    }
    if (!context.canUseProject(project.id)) {
      return {
        success: false,
        error: "This project is not assigned to your team member.",
      };
    }
  }

  return {
    success: true,
    preset: {
      task: preset.task.trim(),
      projectId: preset.projectId,
      billable: preset.billable,
    },
  };
}

export function createRunningTimer(
  preset: Pick<TimerTaskPreset, "task" | "projectId" | "billable">,
  context: {
    workspaceId: string;
    now: number;
    startedDate: string;
    startClock: string;
  } & BillingPreference,
): TimerState {
  const validation = validateTimerDetails(preset.task, preset.projectId);
  if (!validation.success) throw new Error(validation.error);
  return {
    status: "running",
    workspaceId: context.workspaceId,
    task: preset.task.trim(),
    projectId: preset.projectId,
    billable: preset.billable,
    startedAt: context.now,
    startedDate: context.startedDate,
    accumulated: 0,
    startClock: context.startClock,
    hourlyRate: context.hourlyRate,
    currency: context.currency,
  };
}

function sameTimerTask(first: TimerTaskPreset, second: TimerTaskPreset) {
  return (
    first.task === second.task &&
    first.projectId === second.projectId &&
    first.billable === second.billable
  );
}

export function rememberRecentTimerTask(
  recentTasks: readonly TimerTaskPreset[],
  preset: TimerTaskPreset,
  limit = 8,
): TimerTaskPreset[] {
  const existing = recentTasks.find((task) => sameTimerTask(task, preset));
  const next = {
    task: preset.task,
    projectId: preset.projectId,
    billable: preset.billable,
    ...(preset.favorite || existing?.favorite ? { favorite: true } : {}),
  } satisfies TimerTaskPreset;
  return [next, ...recentTasks.filter((task) => !sameTimerTask(task, preset))].slice(0, limit);
}

export function recentTimerTasksFromEntries(
  entries: readonly TimeEntry[],
  limit = 8,
): TimerTaskPreset[] {
  const recentTasks: TimerTaskPreset[] = [];
  const orderedEntries = [...entries].sort(
    (first, second) =>
      second.date.localeCompare(first.date) || second.start.localeCompare(first.start),
  );
  for (const entry of orderedEntries) {
    if (recentTasks.some((task) => sameTimerTask(task, entry))) continue;
    recentTasks.push({ task: entry.task, projectId: entry.projectId, billable: entry.billable });
    if (recentTasks.length === limit) break;
  }
  return recentTasks;
}
