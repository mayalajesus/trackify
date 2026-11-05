import { expect, test } from "@playwright/test";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";

for (const method of ["mouse", "keyboard"] as const) {
  test(`autocomplete preserves the title when starting with ${method}`, async ({ page }) => {
    const fixture = await installAccountFixture(page);
    await signInAs(page, "owner");
    const bar = page.locator("[data-tracker-bar]");
    const input = bar.locator("[data-timer-task-input]");
    const title = "E2E pending timer recovery";
    await input.fill("E2E");
    const option = page.getByRole("option", { name: title, exact: true });
    await expect(option).toBeVisible();
    if (method === "mouse") await option.click();
    else {
      await input.press("ArrowDown");
      await input.press("Enter");
    }
    await expect(input).toHaveValue(title);
    await bar.getByRole("button", { name: /^(Iniciar|Start)$/ }).click();
    await expect(input).toHaveValue(title);
    await expect.poll(() => fixture.timer?.task).toBe(title);
    await page.reload();
    await expect(input).toHaveValue(title);
    const editedTitle = `${title} atualizado`;
    await input.fill(editedTitle);
    await input.press("Tab");
    await expect(input).toHaveValue(editedTitle);
    await expect.poll(() => fixture.timer?.task).toBe(editedTitle);
  });
}

test("clearing a selected suggestion allows starting an empty timer", async ({ page }) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  const bar = page.locator("[data-tracker-bar]");
  const input = bar.locator("[data-timer-task-input]");
  await input.fill("E2E");
  await page.getByRole("option", { name: "E2E pending timer recovery", exact: true }).click();
  await input.fill("");
  await input.press("Tab");
  await bar.getByRole("button", { name: /^(Iniciar|Start)$/ }).click();
  await expect.poll(() => fixture.timer?.status).toBe("running");
  expect(fixture.timer?.task).toBe("");
  await expect(input).toHaveValue("");
});
