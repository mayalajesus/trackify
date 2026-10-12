import { describe, expect, it } from "vitest";
import { groupEntries, trackerEntryRowKey } from "../../src/components/tracker-entries";
import type { TimeEntry } from "../../src/lib/domain";

const entry = (patch: Partial<TimeEntry>): TimeEntry => ({
  id: "entry-1",
  userId: "user-1",
  date: "2026-10-12",
  task: "Design",
  projectId: "project-1",
  billable: false,
  start: "09:00",
  end: "10:00",
  seconds: 3600,
  ...patch,
});

const group = (entries: TimeEntry[]) =>
  groupEntries([{ date: "2026-10-12", totalSeconds: 0, entries }]);

describe("tracker grouping behavior", () => {
  it("groups normalized task names without changing input order or objects", () => {
    const entries = [
      entry({ id: "first" }),
      entry({ id: "second", task: " design ", start: "11:00", end: "12:00" }),
    ];
    const before = structuredClone(entries);
    const result = group(entries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      task: " design ",
      totalSeconds: 7200,
      start: "09:00",
      end: "12:00",
    });
    expect(result[0]!.entries.map((item) => item.id)).toEqual(["second", "first"]);
    expect(result[0]!.entries[1]).toBe(entries[0]);
    expect(entries).toEqual(before);
  });

  it("keeps project, date, billing, urgency and Trello card groups separate", () => {
    const entries = [
      entry({}),
      entry({ id: "project", projectId: "project-2" }),
      entry({ id: "date", date: "2026-10-11" }),
      entry({ id: "billing", billable: true }),
      entry({ id: "urgent", taskDetails: { id: "task-1", urgent: true } }),
      entry({
        id: "trello",
        taskDetails: {
          id: "task-2",
          urgent: false,
          trelloCard: {
            id: "card",
            name: "Card",
            url: "https://trello.com/c/card",
            board: "Board",
          },
        },
      }),
    ];
    expect(group(entries)).toHaveLength(6);
  });

  it("preserves the latest end date for overnight groups and stable row keys", () => {
    const overnight = entry({
      id: "night / 1",
      start: "23:00",
      end: "01:00",
      endDate: "2026-10-13",
      seconds: 7200,
    });
    const result = group([entry({}), overnight]);
    expect(result[0]).toMatchObject({
      start: "09:00",
      end: "01:00",
      endDate: "2026-10-13",
      totalSeconds: 10800,
    });
    expect(trackerEntryRowKey(result[0]!, overnight, 0)).toBe(
      trackerEntryRowKey(result[0]!, overnight, 9),
    );
    expect(trackerEntryRowKey(result[0]!, overnight, 0)).toBe("tracker-entry-night%20%2F%201");
  });

  it("uses deterministic id ordering when all recency fields are equal", () => {
    expect(
      group([entry({ id: "b" }), entry({ id: "a" })])[0]!.entries.map((item) => item.id),
    ).toEqual(["a", "b"]);
    expect(group([])).toEqual([]);
  });
});
