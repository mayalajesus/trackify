import type { TimeEntry } from "@/lib/domain";
import { getEndDateForEntry } from "@/lib/format";
import type { TrackerDay, TrackerGroup } from "./types";

export function groupKeyFor(entry: TimeEntry): string {
  return [
    entry.date,
    entry.task.trim().toLocaleLowerCase(),
    entry.projectId ?? "none",
    entry.billable ? "billable" : "internal",
    entry.taskDetails?.urgent ? "urgent" : "normal",
    entry.taskDetails?.trelloCard?.url.match(
      /^https:\/\/trello\.com\/c\/([A-Za-z0-9]{8})(?:\/|$)/,
    )?.[1] ??
      entry.taskDetails?.trelloCard?.id ??
      "",
  ].join("::");
}

export function compareEntryRecency(a: TimeEntry, b: TimeEntry): number {
  const startOrder = `${b.date}T${b.start}`.localeCompare(`${a.date}T${a.start}`);
  if (startOrder !== 0) return startOrder;

  const endA = `${getEndDateForEntry(a)}T${a.end}`;
  const endB = `${getEndDateForEntry(b)}T${b.end}`;
  const endOrder = endB.localeCompare(endA);
  if (endOrder !== 0) return endOrder;

  const taskOrder = a.task.trim().localeCompare(b.task.trim(), undefined, {
    sensitivity: "base",
  });
  if (taskOrder !== 0) return taskOrder;

  const projectOrder = (a.projectId ?? "none").localeCompare(b.projectId ?? "none");
  if (projectOrder !== 0) return projectOrder;

  return a.id.localeCompare(b.id);
}

export function compareGroupRecency(a: TrackerGroup, b: TrackerGroup): number {
  const latestA = a.entries[0];
  const latestB = b.entries[0];
  if (!latestA || !latestB) return 0;
  return compareEntryRecency(latestA, latestB);
}

export function groupEntries(days: TrackerDay[]): TrackerGroup[] {
  const groups = new Map<string, TrackerGroup>();

  days.forEach((day) => {
    [...day.entries].sort(compareEntryRecency).forEach((entry) => {
      const key = groupKeyFor(entry);
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(entry);
        existing.totalSeconds += entry.seconds;
        existing.start = entry.start < existing.start ? entry.start : existing.start;
        const entryEndDate = getEndDateForEntry(entry);
        const existingEndKey = `${existing.endDate}T${existing.end}`;
        const entryEndKey = `${entryEndDate}T${entry.end}`;
        if (entryEndKey > existingEndKey) {
          existing.end = entry.end;
          existing.endDate = entryEndDate;
        }
        return;
      }

      groups.set(key, {
        id: `tracker-group-${encodeURIComponent(key)}`,
        date: entry.date,
        task: entry.task,
        projectId: entry.projectId,
        billable: entry.billable,
        entries: [entry],
        totalSeconds: entry.seconds,
        start: entry.start,
        end: entry.end,
        endDate: getEndDateForEntry(entry),
      });
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort(compareEntryRecency),
    }))
    .sort(compareGroupRecency);
}

export function trackerEntryRowKey(_group: TrackerGroup, entry: TimeEntry, _index: number): string {
  return `tracker-entry-${encodeURIComponent(entry.id)}`;
}
