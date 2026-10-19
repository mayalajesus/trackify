import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openAppPage, signInAs } from "../support/qa-auth";

for (const route of ["/tracker", "/reports?view=overview", "/reports?view=detailed", "/settings"]) {
  test(`has no critical accessibility violations on ${route}`, async ({ page }) => {
    await signInAs(page, "owner");
    const reportLoaded = route.startsWith("/reports")
      ? page.waitForResponse(
          (response) =>
            response.url().includes("/api/data") &&
            response.request().postDataJSON()?.operation === "loadReportEntries",
          { timeout: 30_000 },
        )
      : null;
    await openAppPage(page, route);
    if (reportLoaded) expect((await reportLoaded).status()).toBe(200);
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((violation) => violation.impact === "critical");
    expect(critical, critical.map((violation) => violation.help).join("; ")).toEqual([]);
  });
}

test("project quick create remains accessible with the picker and modal open", async ({ page }) => {
  await signInAs(page, "owner");
  await openAppPage(page, "/tracker");
  const trackerBar = page.locator("[data-tracker-bar]");
  await trackerBar.locator('[data-project-select] [data-slot="autocomplete-trigger"]').click();
  await page.getByLabel(/Search projects|Buscar projetos/).fill("Accessible project");

  const createProject = page.getByRole("button", {
    name: /Create new project|Criar novo projeto/,
  });
  await createProject.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /New project|Novo projeto/ })).toBeVisible();
  await expect(page.getByLabel(/Name|Nome/, { exact: true })).toHaveValue("Accessible project");

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((violation) => violation.impact === "critical");
  expect(critical, critical.map((violation) => violation.help).join("; ")).toEqual([]);
});
