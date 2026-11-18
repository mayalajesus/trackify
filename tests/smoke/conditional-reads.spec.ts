import { expect, test } from "@playwright/test";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";

test("revalidates without another snapshot, receives remote edits and preserves offline edits", async ({
  page,
  context,
}) => {
  const fixture = await installAccountFixture(page, true);
  await signInAs(page, "owner");
  await page.goto("/tests/fixtures/durable-recovery.html");
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  const payloads = fixture.accountPayloads;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => fixture.accountRevalidations).toBeGreaterThan(0);
  expect(fixture.accountPayloads).toBe(payloads);
  fixture.account!.workspaces[0]!.clients[0]!.name = "Remote edit";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Client name")).toHaveText("Remote edit");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Edit fixture client" }).click();
  await expect(page.getByLabel("Client name")).toHaveText("Local recovery edit");
  await context.setOffline(false);
  await expect
    .poll(() => fixture.account!.workspaces[0]!.clients[0]!.name)
    .toBe("Local recovery edit");
  await expect(page.getByLabel("Save error")).toBeEmpty();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
