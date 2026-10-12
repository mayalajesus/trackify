import type { TimeEntry } from "@/lib/domain";

export interface TrackerDay {
  date: string;
  totalSeconds: number;
  entries: TimeEntry[];
}

export type TrackerEditableField =
  "task" | "description" | "project" | "start" | "end" | "date" | "duration" | "billable";

export type ActiveCell = {
  rowKey: string;
  field: TrackerEditableField;
} | null;

export type TrackerGroup = {
  id: string;
  date: string;
  task: string;
  projectId: string | null;
  billable: boolean;
  entries: TimeEntry[];
  totalSeconds: number;
  start: string;
  end: string;
  endDate: string;
};

export type EntryDraft = {
  date: string;
  task: string;
  projectId: string | null;
  start: string;
  end: string;
  endDate: string;
  duration: string;
  description: string;
  billable: boolean;
};
