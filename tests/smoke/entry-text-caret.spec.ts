import { expect, test } from "@playwright/test";
import { getLocalToday } from "../../src/lib/format";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";

test("completed task text preserves the caret when editing in the middle", async ({ page }) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  const entry = fixture.account!.workspaces[0]!.entries[0]!;
  entry.date = getLocalToday();
  entry.endDate = entry.date;
  entry.task = "Texto original da tarefa";
  entry.description = "Texto original da observação";
  await page.reload();
  const row = page.locator("[data-tracker-entry]").first();
  for (const field of ["task", "description"] as const) {
    const original = entry[field]!;
    await row.locator(`[data-tracker-field="${field}"]`).click();
    const input = row.locator("input[data-tracker-editor]");
    await input.click();
    await input.press("Home");
    for (let i = 0; i < 6; i++) await input.press("ArrowRight");
    for (const character of ["n", "o", "v", "o", " "]) {
      await input.pressSequentially(character);
    }
    await expect(input).toHaveValue(original.slice(0, 6) + "novo " + original.slice(6));
    expect(await input.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(11);
    await input.press("Enter");
    await expect
      .poll(() => fixture.account!.workspaces[0]!.entries[0]![field])
      .toBe(original.slice(0, 6) + "novo " + original.slice(6));
  }
});
