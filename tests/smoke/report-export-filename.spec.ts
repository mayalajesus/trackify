import { expect, test } from "@playwright/test";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";

for (const scope of ["workspace", "member"] as const) {
  test(`downloads all formats with ${scope} and the selected period`, async ({ page }) => {
    const fixture = await installAccountFixture(page);
    await signInAs(page, "owner");
    const memberId = fixture.account!.identities[0]!.id;
    const members = scope === "member" ? memberId : "";
    await page.goto(
      `/reports?view=detailed&preset=custom&start=2026-10-01&end=2026-10-31&members=${members}`,
    );
    await page.getByRole("button", { name: /^(Exportar|Export)$/ }).click();
    const dialog = page.getByRole("dialog");
    for (const format of ["csv", "xlsx", "pdf"]) {
      await dialog.getByText(format.toUpperCase(), { exact: true }).click();
      await expect(
        dialog.getByRole("radio", { name: format.toUpperCase(), exact: true }),
      ).toBeChecked();
      const downloadPromise = page.waitForEvent("download");
      await dialog.getByRole("button", { name: /^(Exportar|Export)$/ }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(
        `${members ? "QA Fixture" : "Recovery QA"} - Relatório detalhado - 01-10-2026 a 31-10-2026.${format}`,
      );
      expect(await download.failure()).toBeNull();
    }
  });
}

test("personal report uses the permitted member and one date", async ({ page }) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  fixture.account!.workspaces[0]!.memberships[0]!.role = "Member";
  await page.goto("/reports?view=detailed&preset=custom&start=2026-10-01&end=2026-10-01");
  await page.getByRole("button", { name: /^(Exportar|Export)$/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(Exportar|Export)$/ })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("QA Fixture - Relatório detalhado - 01-10-2026.csv");
});
