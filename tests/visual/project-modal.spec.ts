import { expect, test } from "@playwright/test";

for (const width of [1280, 390, 320]) {
  test(`project modal follows DEV at ${width}px`, async ({ page }) => {
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "localhost" && !url.pathname.startsWith("/api/")
        ? route.continue()
        : route.abort();
    });
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/tests/visual/project-modal.html");
    await page.getByRole("button", { name: "Abrir projeto", exact: true }).click();
    const modal = page.locator(".project-form-modal");
    await expect(modal).toBeVisible();
    await expect(page.locator(".modal__container")).not.toHaveAttribute("data-entering", "true");
    await page.evaluate(() => document.fonts.ready);
    await expect(modal).toHaveCSS("padding", "28px 24px 24px");
    await expect(modal).toHaveCSS("border-radius", "24px");
    if (width === 1280) {
      const bounds = await modal.boundingBox();
      expect(bounds!.width).toBe(384);
      expect(bounds!.height).toBe(468);
    }
    await expect(modal.locator(".input")).toHaveCSS("height", "36px");
    await expect(modal.locator(".input")).toHaveCSS("border-radius", "12px");
    await expect(modal.locator(".modal__heading")).toHaveCSS("line-height", "24px");
    await expect(modal.locator(".switch__control")).toHaveCSS("width", "40px");
    const buttons = modal.locator(".modal__footer > button");
    const a = await buttons.nth(0).boundingBox();
    const b = await buttons.nth(1).boundingBox();
    expect(a!.width).toBeCloseTo(b!.width, 0);
    expect(b!.x - a!.x - a!.width).toBeCloseTo(8, 0);
    expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/project-modal-${width}.png` });
    await modal.locator(".switch__control").click();
    await expect(page.getByRole("switch", { name: "Faturável" })).toBeChecked();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(modal).not.toBeVisible();
  });
}
