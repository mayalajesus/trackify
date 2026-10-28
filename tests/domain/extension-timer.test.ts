import { describe, it, expect } from "vitest";
import {
  extensionCard,
  extensionElapsed,
  extensionOptions,
  extensionTask,
} from "../../server/data/extension.mjs";
import { taskDetailsValue } from "../../server/task-actions.mjs";
describe("extension timer input", () => {
  it("accepts a named manual task without a Trello association", () => {
    expect(extensionTask({ source: "manual", task: "  Planejamento  " })).toEqual({
      name: "Planejamento",
      card: null,
    });
  });
  it.each([
    { source: "manual", task: " " },
    { source: "manual", task: 12 },
    { source: "manual", task: "x".repeat(241) },
    { source: "manual", task: "Nome", card: { url: "https://trello.com/c/AbCd1234" } },
    { source: "other", task: "Nome" },
    { task: "Nome" },
  ])("does not bypass source or name validation", (body) => {
    expect(() => extensionTask(body)).toThrow();
  });
  it("validates optional task controls and deduplicates recipients", () => {
    const id = "12345678-1234-4234-8234-123456789abc";
    expect(
      extensionOptions({ description: "Nota", urgent: true, favorite: true, memberIds: [id, id] }),
    ).toEqual({ description: "Nota", urgent: true, favorite: true, memberIds: [id] });
    expect(extensionOptions({})).toEqual({
      description: "",
      urgent: false,
      favorite: undefined,
      memberIds: [],
    });
  });
  it.each([
    { description: 1 },
    { description: "a".repeat(10001) },
    { urgent: "true" },
    { favorite: 1 },
    { memberIds: null },
    { memberIds: [""] },
    { memberIds: [42] },
    { memberIds: Array(51).fill("12345678-1234-4234-8234-123456789abc") },
  ])("rejects invalid task controls", (body) => {
    expect(() => extensionOptions(body)).toThrow();
  });
  it("canonicalizes a Trello card without forwarding tracking parameters", () => {
    const card = extensionCard({
      url: "https://trello.com/c/AbCd1234/name?q=secret#x",
      title: "Task",
    });
    expect(card.url).toBe("https://trello.com/c/AbCd1234");
    expect(
      taskDetailsValue({
        id: "12345678-1234-1234-1234-123456789abc",
        urgent: false,
        trelloCard: card,
      }),
    ).toMatchObject({ trelloCard: card });
  });
  it.each([
    "https://evil.test/c/AbCd1234",
    "https://trello.com.evil.test/c/AbCd1234",
    "https://user@trello.com/c/AbCd1234",
    "http://trello.com/c/AbCd1234",
    "https://trello.com/b/AbCd1234",
  ])("rejects %s", (url) => {
    expect(() => extensionCard({ url, title: "Task" })).toThrow();
  });
  it("counts seconds and excludes paused wall time", () => {
    const started = Date.parse("2026-10-15T12:00:00Z");
    expect(
      extensionElapsed(
        { status: "running", started_at: new Date(started), accumulated_seconds: 12 },
        started + 5900,
      ),
    ).toBe(17);
    expect(
      extensionElapsed(
        { status: "paused", started_at: null, accumulated_seconds: 12 },
        started + 3600000,
      ),
    ).toBe(12);
  });
});
