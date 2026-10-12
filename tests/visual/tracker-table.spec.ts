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
    for (const actions of await page.locator("[data-tracker-action]").all()) {
      const geometry = await actions.evaluate((element) => {
        const cell = element.closest("td")!.getBoundingClientRect();
        const icons = [...element.querySelectorAll("button > svg")].map((icon) =>
          icon.getBoundingClientRect(),
        );
        return {
          width: cell.width,
          gap: icons[1]!.left - icons[0]!.right,
          inset: icons[0]!.left - cell.left,
          iconWidths: icons.map((icon) => icon.width),
        };
      });
      expect(geometry).toEqual({ width: 60, gap: 12, inset: 8, iconWidths: [16, 16] });
    }
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath("tracker-table.png"), fullPage: true });
    if (width === 390) {
      await values.nth(3).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("tracker-values-mobile.png") });
    }
    await page.locator("[data-tracker-group-toggle]").first().click();
    await expect(page.locator("[data-grouped-child]")).toHaveCount(0);
    const single = page.locator(".table__row").filter({ hasText: "estudo" });
    await single.locator("[data-tracker-action] button").last().click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(page.locator(".tracker-action-menu")).toHaveCSS("width", "214px");
    await expect(menu.getByRole("menuitem")).toHaveCount(6);
    await menu.getByRole("menuitem", { name: "Excluir registro", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Excluir registro de horas?", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".modal__container")).not.toHaveAttribute("data-entering", "true");
    await expect(dialog).toHaveCSS("padding", "28px 24px 24px");
    await expect(dialog.locator(".modal__body")).toHaveCSS("padding-top", "18px");
    await expect(dialog.locator(".modal__footer")).toHaveCSS("padding-top", "20px");
    await expect(dialog.locator(".modal__heading")).toHaveCSS("letter-spacing", "normal");
    await expect(dialog.locator(".modal__close-trigger")).toHaveCSS("width", "24px");
    await expect(dialog.locator(".modal__close-trigger")).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(dialog.locator(".typography")).toHaveCSS("color", "rgb(128, 128, 128)");
    await expect(dialog).toHaveCSS("box-shadow", "none");
    if (width >= 960) {
      expect((await dialog.boundingBox())!.height).toBe(170);
      expect((await dialog.boundingBox())!.width).toBe(384);
    }
    const keep = dialog.getByRole("button", { name: "Manter registro" });
    await expect(keep).toHaveCSS("font-weight", "400");
    await expect(keep).toHaveCSS("color", "rgb(27, 27, 27)");
    await page.screenshot({ path: test.info().outputPath("tracker-delete.png") });
    await keep.click();
    await expect(dialog).toBeHidden();
    await expect(single).toBeVisible();
  });
}
