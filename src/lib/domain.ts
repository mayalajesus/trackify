import type { CurrencyCode } from "./billing";

export type Role = "Owner" | "Admin" | "Member";
export type ProjectStatus = "active" | "on-hold" | "archived";

export interface Client {
  /** Absent in older snapshots; defaults to black. */
  color?: string;
  status?: ProjectStatus;
  memberIds?: string[];
  id: string;
  name: string;
  contact: string;
  /** Missing in older account snapshots; defaults to false. */
  billable?: boolean;
  currency?: CurrencyCode;
  /** Total hours contracted; null or absent means no limit configured. */
  contractedHours?: number | null;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  billable: boolean;
  status: ProjectStatus;
  color: string;
  lastActivity: string;
  memberIds: string[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "removed";
  initials: string;
  invitedAt?: string;
  deletedAt?: string;
}

export interface TaskDetails {
  description?: string;
  id: string;
  urgent: boolean;
  trelloCard?: { id: string; name: string; url: string; board: string } | null;
}

export interface TimeEntry {
  sharedSourceEntryId?: string;
  taskDetails?: TaskDetails;
  id: string;
  date: string;
  start: string;
  end: string;
  endDate?: string | undefined;
  startTimestamp?: number | undefined;
  endTimestamp?: number | undefined;
  seconds: number;
  userId: string;
  projectId: string | null;
  task: string;
  description?: string | undefined;
  billable: boolean;
  hourlyRate?: number;
  currency?: CurrencyCode;
}

export type TrelloStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "syncing"
  | "synced"
  | "error"
  | "reconnect-required";

export interface TrelloState {
  status: TrelloStatus;
  workspace: string | null;
  board: string | null;
  lists: string[];
  cards: string[];
  rule: "all" | "lists" | "cards";
  lastSync: string | null;
}
