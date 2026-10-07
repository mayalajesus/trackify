import { expect, test } from "@playwright/test";
import { signInAs } from "../support/qa-auth";

test("loads reports directly without entering an update loop", async ({ page }) => {
  await signInAs(page, "owner");

  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Maximum update depth exceeded|useI18n must be used inside AppI18nProvider/.test(
        message.text(),
      )
    ) {
      runtimeErrors.push(message.text());
    }
  });

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: /Reports|Relatórios/, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/reports\?.*preset=/);
  await page.waitForTimeout(500);

  expect(runtimeErrors).toEqual([]);
});

test("keeps reports interactive while switching and reusing periods", async ({ page }) => {
  const reportRequests: Array<{ startDate: string; endDate: string }> = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/data") || request.method() !== "POST") return;
    try {
      const body = request.postDataJSON() as {
        operation?: string;
        startDate?: string;
        endDate?: string;
      };
      if (body.operation === "loadReportEntries" && body.startDate && body.endDate) {
        reportRequests.push({ startDate: body.startDate, endDate: body.endDate });
      }
    } catch {
      // Ignore non-JSON requests.
    }
  });

  await signInAs(page, "owner");
  await page.goto("/reports?preset=this-week");
  await expect(page.locator("#main-content")).toBeVisible();
  await expect.poll(() => reportRequests.length).toBeGreaterThan(0);

  const firstPeriod = reportRequests.at(-1)!;
  const nextRange = page.getByRole("button", { name: /Next range|Próximo/ }).first();
  await nextRange.click();
  await expect(page.locator("#main-content")).toBeVisible();
  await expect.poll(() => reportRequests.length).toBeGreaterThan(1);
  expect(reportRequests.at(-1)).not.toEqual(firstPeriod);

  const requestCountAfterNext = reportRequests.length;
  const previousRange = page
    .getByRole("button", { name: /Previous (?:range|period)|período anterior/i })
    .first();
  await previousRange.click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.waitForTimeout(500);
  expect(reportRequests.length).toBe(requestCountAfterNext);
});

test("persists report filters across report views, reloads and route navigation", async ({
  page,
}) => {
  await signInAs(page, "owner");
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("trackify:report-filters:")) window.localStorage.removeItem(key);
    }
  });

  await page.goto("/reports?view=overview");
  await expect(
    page.getByRole("button", { name: /Billability filter|Filtro de Faturabilidade/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Open Billability|Open Faturabilidade/ }).click();
  await page.getByRole("menuitemradio", { name: /Internal|Interno/ }).click();
  await expect(page).toHaveURL(/billability=internal/);

  await page
    .getByRole("navigation", { name: /Report views|Visualizações do relatório/ })
    .getByRole("button", { name: /Detailed|Detalhado/ })
    .click();
  await expect(page).toHaveURL(/view=detailed/);
  await expect(page).toHaveURL(/billability=internal/);
  await expect(
    page.getByRole("button", { name: /Billability filter|Filtro de Faturabilidade/ }),
  ).toContainText(/Internal|Interno/);
  await page.getByRole("button", { name: /Choose columns|Escolher colunas/ }).click();
  await page
    .getByRole("dialog", { name: /Choose columns|Escolher colunas/ })
    .getByRole("checkbox", { name: /Description|Descrição/ })
    .check({ force: true });
  await expect(page).toHaveURL(/columns=[^&]*description/);

  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/view=detailed/);
  await expect(page).toHaveURL(/billability=internal/);
  await expect(
    page.getByRole("button", { name: /Billability filter|Filtro de Faturabilidade/ }),
  ).toContainText(/Internal|Interno/);
  await page.getByRole("button", { name: /Choose columns|Escolher colunas/ }).click();
  await expect(
    page
      .getByRole("dialog", { name: /Choose columns|Escolher colunas/ })
      .getByRole("checkbox", { name: /Description|Descrição/ }),
  ).toBeChecked();
  await page.keyboard.press("Escape");

  await page.goto("/tracker");
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await page.goto("/reports?view=overview");
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/view=overview/);
  await expect(page).toHaveURL(/billability=internal/);
  await expect(
    page.getByRole("button", { name: /Billability filter|Filtro de Faturabilidade/ }),
  ).toContainText(/Internal|Interno/);
  await page
    .getByRole("navigation", { name: /Report views|Visualizações do relatório/ })
    .getByRole("button", { name: /Detailed|Detalhado/ })
    .click();
  await page.getByRole("button", { name: /Choose columns|Escolher colunas/ }).click();
  await expect(
    page
      .getByRole("dialog", { name: /Choose columns|Escolher colunas/ })
      .getByRole("checkbox", { name: /Description|Descrição/ }),
  ).toBeChecked();
});
