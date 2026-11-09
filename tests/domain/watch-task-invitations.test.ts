import { afterEach, expect, it, vi } from "vitest";
import { watchTaskInvitations } from "../../src/lib/watch-task-invitations";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("refreshes on return and reconnect, without accepting a stale or concurrent response", async () => {
  vi.useFakeTimers();
  const tab = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const browser = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
  const network = { onLine: true };
  vi.stubGlobal("document", tab);
  vi.stubGlobal("window", browser);
  vi.stubGlobal("navigator", network);
  let finish!: (value: undefined) => void;
  const load = vi.fn(
    (_current: () => boolean) =>
      new Promise<undefined>((resolve) => {
        finish = resolve;
      }),
  );
  const clear = vi.fn();
  const stop = watchTaskInvitations(load, clear);
  browser.dispatchEvent(new Event("focus"));
  expect(load).toHaveBeenCalledTimes(1);
  tab.visibilityState = "hidden";
  tab.dispatchEvent(new Event("visibilitychange"));
  expect(load.mock.calls[0]?.[0]()).toBe(false);
  tab.visibilityState = "visible";
  tab.dispatchEvent(new Event("visibilitychange"));
  finish(undefined);
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(2);
  finish(undefined);
  await vi.advanceTimersByTimeAsync(5000);
  expect(load).toHaveBeenCalledTimes(3);
  network.onLine = false;
  browser.dispatchEvent(new Event("offline"));
  finish(undefined);
  await vi.advanceTimersByTimeAsync(30000);
  expect(load).toHaveBeenCalledTimes(3);
  network.onLine = true;
  browser.dispatchEvent(new Event("online"));
  expect(load).toHaveBeenCalledTimes(4);
  expect(clear).toHaveBeenCalledTimes(2);
  stop();
  expect(load.mock.calls[3]?.[0]()).toBe(false);
  finish(undefined);
  await vi.advanceTimersByTimeAsync(10000);
  expect(load).toHaveBeenCalledTimes(4);
});
