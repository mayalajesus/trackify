import { expect, test } from "@playwright/test";

for (const width of [1280, 960, 390]) {
  test(`grouped tracker values remain complete at ${width}px`, async ({ page }) => {
    // Fresh, signed-out context with synthetic entries; never send requests to a data service.
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "localhost" && !url.pathname.startsWith("/api/")
        ? route.continue()
        : route.abort();
    });
    await page.setViewportSize({ width, height: 720 });
    await page.goto("/tests/visual/tracker-table.html");
    const values = page.locator(".tracker-summary-value");
    await expect(values).toHaveCount(8);
    await page.evaluate(() => document.fonts.ready);
    for (const value of await values.all()) {
      await expect(value).toHaveCSS("font-size", "14px");
      await expect(value).toHaveCSS("line-height", "20px");
      await expect(value).toHaveCSS("font-weight", "400");
      await expect(value).toHaveCSS("font-family", /Inter/);
      await expect(value).toHaveCSS("color", "rgb(27, 27, 27)");
      expect(
        await value.evaluate((element) => {
          const cell = element.closest("td")!;
          const bounds = element.getBoundingClientRect();
          const cellBounds = cell.getBoundingClientRect();
          return (
            element.scrollWidth <= element.clientWidth + 1 &&
            bounds.left >= cellBounds.left &&
            bounds.right <= cellBounds.right &&
            bounds.top >= cellBounds.top &&
            bounds.bottom <= cellBounds.bottom
          );
        }),
      ).toBe(true);
    }
    await expect(values.filter({ hasText: "12 de out." })).toHaveCount(2);
    await expect(values.filter({ hasText: "23h 58min" })).toHaveCount(1);
    await expect(values.locator("sup")).toHaveText("+1");
    await page.locator("[data-tracker-group-toggle]").first().click();
    await expect(page.locator("[data-grouped-child]")).toHaveCount(2);
    const start = page.locator('button[data-tracker-field="start"]').first();
    await expect(start).toHaveCSS("font-weight", "400");
    await expect(start).toHaveCSS("line-height", "20px");
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath("tracker-table.png"), fullPage: true });
    if (width === 390) {
      await values.nth(3).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("tracker-values-mobile.png") });
    }
    await page.locator("[data-tracker-group-toggle]").first().click();
    await expect(page.locator("[data-grouped-child]")).toHaveCount(0);
  });
}
