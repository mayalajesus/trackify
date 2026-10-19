import { expect, test } from "@playwright/test";
import { openAppPage, signInAs } from "../support/qa-auth";

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

  await openAppPage(page, "/reports");
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
  await openAppPage(page, "/reports?preset=this-week");
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

test("persists the client filter across report views, reloads and route navigation", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAs(page, "owner");
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("trackify:report-filters:")) window.localStorage.removeItem(key);
    }
  });
  await openAppPage(page, "/reports?view=overview");
  const clientFilter = page.getByRole("button", { name: /Client filter|Filtro de Cliente/ });
  await expect(clientFilter).toBeVisible();
  const clear = page.getByRole("button", { name: /Clear filters|Limpar filtros/ });
  if (await clear.isEnabled()) {
    await clear.click();
    await expect(clear).toBeDisabled();
  }
  await clientFilter.click();
  const option = page.getByRole("menuitemcheckbox").first();
  const clientName = (await option.innerText()).trim();
  const clientId = await option.getAttribute("data-key");
  if (!clientId) throw new Error("The client option has no stable identifier.");
  const saved = page.waitForResponse((response) => {
    if (!response.url().includes("/api/data")) return false;
    const body = response.request().postDataJSON() as {
      operation?: string;
      account?: {
        preferencesByUserId?: Record<
          string,
          { reportFilters?: Record<string, { clientIds?: string[] }> }
        >;
      };
    };
    return (
      body.operation === "syncAccount" &&
      Object.values(body.account?.preferencesByUserId ?? {}).some((preferences) =>
        Object.values(preferences.reportFilters ?? {}).some((filters) =>
          filters.clientIds?.includes(clientId),
        ),
      )
    );
  });
  await option.click();
  await page.keyboard.press("Escape");
  expect((await saved).status()).toBe(200);
  const verifyFilter = async () => {
    await expect.poll(() => new URL(page.url()).searchParams.get("clients")).toBe(clientId);
    await expect(clientFilter).toContainText(clientName);
  };
  await verifyFilter();
  await page.getByRole("radio", { name: /^(Detailed|Detalhado)$/ }).click();
  await expect(page).toHaveURL(/view=detailed/);
  await verifyFilter();
  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("radio", { name: /^(Detailed|Detalhado)$/ })).toBeChecked();
  await verifyFilter();
  await openAppPage(page, "/tracker");
  await openAppPage(page, "/reports?view=overview");
  await expect(page.getByRole("radio", { name: /^(Overview|Visão geral)$/ })).toBeChecked();
  await verifyFilter();
});
