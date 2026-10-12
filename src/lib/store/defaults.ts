import type { UserPreferences, WorkspaceSettings } from "../account-types";

import type { TrelloState } from "../domain";

import { defaultLocale } from "../i18n";

import type { TimerState } from "./types";

import { getInitialTimeZone } from "./preferences";

export const initialTimer: TimerState = {
  status: "idle",
  workspaceId: null,
  task: "",
  projectId: null,
  billable: false,
  startedAt: null,
  startedDate: null,
  accumulated: 0,
  startClock: "09:00",
};

export const initialSettings: WorkspaceSettings = {
  weekStart: "monday",
};

export const initialPreferences: UserPreferences = {
  idleDetection: true,
  language: defaultLocale,
  theme: "system",
  avatarUrl: null,
  timezone: getInitialTimeZone(),
  activeWorkspaceId: null,
  reportFilters: {},
};

export const initialTrello: TrelloState = {
  status: "disconnected",
  workspace: null,
  board: null,
  lists: [],
  cards: [],
  rule: "lists",
  lastSync: null,
};
