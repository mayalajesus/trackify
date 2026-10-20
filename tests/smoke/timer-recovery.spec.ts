import { expect, test, type Page } from "@playwright/test";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";

const task = "E2E pending timer recovery";

function recoveryAlert(page: Page) {
  return page.getByRole("alert");
}
async function openFixture(page: Page, failRead = false) {
  await signInAs(page, "owner");
  return async () => {
    await page.goto("/tests/fixtures/timer-recovery.html");
    await expect(page.getByLabel("Timer status")).toHaveText("idle");
    if (failRead) await expect(recoveryAlert(page)).toContainText("Temporary timer read failure");
  };
}
async function startLocalTimer(page: Page) {
  await page.getByRole("button", { name: "Start fixture timer" }).click();
  await expect(page.getByLabel("Timer status")).toHaveText("running");
}

test("retrying the initial timer read preserves and saves a timer started locally", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  const open = await openFixture(page, true);
  fixture.timerReadFailurePath = "/tests/fixtures/timer-recovery.html";
  fixture.timerReadFailures = 1;
  await open();
  await startLocalTimer(page);
  expect(fixture.timerWrites).toHaveLength(0);
  await page.getByRole("button", { name: "Retry fixture save" }).click();
  await expect.poll(() => fixture.timerWrites.length).toBe(1);
  expect(fixture.timer?.task).toBe(task);
  expect(fixture.timer?.status).toBe("running");
  await expect(recoveryAlert(page)).toBeEmpty();
  await page.reload();
  await expect(page.getByLabel("Timer status")).toHaveText("running");
  await expect(page.getByLabel("Timer task")).toHaveText(task);
});

test("a conflicting server timer leaves both timers intact and the local draft downloadable", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  const open = await openFixture(page, true);
  fixture.timerReadFailurePath = "/tests/fixtures/timer-recovery.html";
  fixture.timerReadFailures = 1;
  await open();
  await startLocalTimer(page);
  fixture.timer = {
    status: "running",
    workspaceId: fixture.account!.workspaces[0]!.workspace.id,
    projectId: fixture.account!.workspaces[0]!.projects[0]!.id,
    task: "Other device timer",
    startedAt: Date.now() - 60_000,
    startedDate: "2026-10-19",
    startClock: "09:00",
    accumulated: 0,
    billable: false,
  };
  await page.getByRole("button", { name: "Retry fixture save" }).click();
  await expect(recoveryAlert(page)).toContainText(/Another timer|Já existe outro timer/);
  await expect(page.getByLabel("Timer status")).toHaveText("running");
  expect(fixture.timer.task).toBe("Other device timer");
  expect(fixture.timerWrites).toHaveLength(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download fixture draft" }).click();
  const stream = await (await downloadPromise).createReadStream();
  if (!stream) throw new Error("Missing recovery download");
  let json = "";
  for await (const chunk of stream) json += chunk.toString();
  expect(JSON.parse(json).timer.task).toBe(task);
});

test("polling cannot overwrite an unsaved timer change after a failed save", async ({ page }) => {
  const fixture = await installAccountFixture(page);
  const open = await openFixture(page);
  const readsBeforeLoad = fixture.timerReads;
  await open();
  await expect.poll(() => fixture.timerReads).toBeGreaterThan(readsBeforeLoad);
  await startLocalTimer(page);
  await expect.poll(() => fixture.timerWrites.length).toBe(1);
  fixture.timerSaveFailures = 1;
  await page.getByRole("button", { name: "Pause fixture timer" }).click();
  await expect(recoveryAlert(page)).toContainText("Temporary timer save failure");
  const reads = fixture.timerReads;
  // Cross a real polling interval: a stale server timer must not replace the draft.
  await page.waitForTimeout(3500);
  await expect(page.getByLabel("Timer status")).toHaveText("paused");
  expect(fixture.timerReads).toBe(reads);
  expect(fixture.timer?.status).toBe("running");
  await page.getByRole("button", { name: "Retry fixture save" }).click();
  await expect.poll(() => fixture.timer?.status).toBe("paused");
  await expect(recoveryAlert(page)).toBeEmpty();
  await page.reload();
  await expect(page.getByLabel("Timer status")).toHaveText("paused");
});
