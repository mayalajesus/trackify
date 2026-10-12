import { describe, expect, it, vi } from "vitest";
import type { Project, TimeEntry } from "../../src/lib/domain";
import {
  createRunningTimer,
  rememberRecentTimerTask,
  validateTimerTaskStart,
} from "../../src/lib/timer-start";

const activeProject: Project = {
  id: "p1",
  name: "Landing Page",
  clientId: "c1",
  billable: true,
  status: "active",
  color: "bg-accent",
  lastActivity: "2026-08-30",
  memberIds: ["u1"],
};

const originalEntry: TimeEntry = {
  id: "e1",
  date: "2026-08-29",
  start: "09:00",
  end: "10:00",
  seconds: 3_600,
  userId: "u1",
  projectId: activeProject.id,
  task: "Design review",
  billable: true,
};

describe("starting a timer from an earlier entry", () => {
  it("creates a new running timer with a valid project and updates recent tasks", () => {
    const result = validateTimerTaskStart(originalEntry, {
      timerStatus: "idle",
      projects: [activeProject],
      canUseProject: () => true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const timer = createRunningTimer(result.preset, {
      workspaceId: "w1",
      now: 1_000,
      startedDate: "2026-08-30",
      startClock: "11:30",
      hourlyRate: 125,
      currency: "BRL",
    });
    const recentTasks = rememberRecentTimerTask([], result.preset);

    expect(timer).toMatchObject({
      status: "running",
      workspaceId: "w1",
      task: originalEntry.task,
      projectId: originalEntry.projectId,
      billable: originalEntry.billable,
      startedAt: 1_000,
      accumulated: 0,
    });
    expect(recentTasks[0]).toEqual(result.preset);
  });

  it("rejects an archived project with a clear message", () => {
    const result = validateTimerTaskStart(originalEntry, {
      timerStatus: "idle",
      projects: [{ ...activeProject, status: "archived" }],
      canUseProject: () => false,
    });

    expect(result).toEqual({
      success: false,
      error: "This project is archived and cannot be used to start a timer.",
    });
  });

  it("rejects the action while another timer is active", () => {
    const canUseProject = vi.fn(() => true);
    const result = validateTimerTaskStart(originalEntry, {
      timerStatus: "running",
      projects: [activeProject],
      canUseProject,
    });

    expect(result).toEqual({
      success: false,
      error: "Stop the active timer before starting another one.",
    });
    expect(canUseProject).not.toHaveBeenCalled();
  });

  it("does not change the earlier entry", () => {
    const snapshot = structuredClone(originalEntry);
    const result = validateTimerTaskStart(originalEntry, {
      timerStatus: "idle",
      projects: [activeProject],
      canUseProject: () => true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const timer = createRunningTimer(result.preset, {
        workspaceId: "w1",
        now: 2_000,
        startedDate: "2026-08-30",
        startClock: "12:00",
        hourlyRate: 80,
        currency: "USD",
      });
      expect(timer).not.toBe(originalEntry);
    }
    expect(originalEntry).toEqual(snapshot);
  });

  it("keeps favorite metadata when the task becomes recent again", () => {
    const favorite = {
      task: originalEntry.task,
      projectId: originalEntry.projectId,
      billable: originalEntry.billable,
      favorite: true,
    };
    const refreshed = rememberRecentTimerTask([favorite], originalEntry);

    expect(refreshed[0]).toEqual(favorite);
  });

  it("distinguishes missing, inactive, unassigned, and explicit no-project starts", () => {
    expect(
      validateTimerTaskStart(originalEntry, {
        timerStatus: "idle",
        projects: [],
        canUseProject: () => true,
      }),
    ).toEqual({ success: false, error: "This project no longer exists." });

    expect(
      validateTimerTaskStart(originalEntry, {
        timerStatus: "idle",
        projects: [{ ...activeProject, status: "on-hold" }],
        canUseProject: () => true,
      }),
    ).toEqual({
      success: false,
      error: "This project is inactive and cannot be used to start a timer.",
    });

    expect(
      validateTimerTaskStart(originalEntry, {
        timerStatus: "idle",
        projects: [activeProject],
        canUseProject: () => false,
      }),
    ).toEqual({
      success: false,
      error: "This project is not assigned to your team member.",
    });

    expect(
      validateTimerTaskStart(
        { task: "Planning", projectId: null, billable: false },
        { timerStatus: "idle", projects: [], canUseProject: () => false },
      ),
    ).toEqual({
      success: false,
      error: "Select a project before starting the timer.",
    });
  });
});
