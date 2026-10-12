import { expect, test } from "@playwright/test";

for (const width of [1280, 390, 320]) {
  test(`manual entry follows DEV spacing and preserves mode changes at ${width}px`, async ({
    page,
  }) => {
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "localhost" && !url.pathname.startsWith("/api/")
        ? route.continue()
        : route.abort();
    });
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install({ time: new Date("2026-09-30T16:00:00Z") });
    await page.goto("/tests/visual/tracker-table.html");
    await page.getByRole("button", { name: "Abrir registro manual" }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar horas manualmente", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".modal__container")).not.toHaveAttribute("data-entering", "true");
    await page.evaluate(() => document.fonts.ready);
    await expect(dialog).toHaveCSS("padding", "24px");
    await expect(dialog.locator(".modal__header")).toHaveCSS("padding-bottom", "20px");
    await expect(dialog.locator(".modal__footer")).toHaveCSS("padding-top", "16px");
    await expect(dialog.locator(".manual-entry-time")).toHaveCSS("gap", "12px");
    await expect(dialog.locator(".manual-entry-mode")).toHaveCSS("height", "32px");
    await expect(dialog.locator(".manual-entry-mode")).toHaveCSS("width", "209px");
    await expect(dialog.locator(".manual-entry-billing")).toHaveCSS("height", "29px");
    await expect(dialog.locator(".textarea")).toHaveCSS("height", "76px");
    await expect(dialog.locator(".description")).toHaveCSS("line-height", "16px");
    await expect(dialog.locator(".description")).toHaveCSS("color", "rgb(107, 114, 128)");
    expect(
      await dialog
        .locator(".description")
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    ).toBe(true);
    await dialog.locator(".description").scrollIntoViewIfNeeded();
    const cancel = dialog.getByRole("button", { name: "Cancelar", exact: true });
    const save = dialog.getByRole("button", { name: "Salvar registro", exact: true });
    const cancelBox = (await cancel.boundingBox())!;
    const saveBox = (await save.boundingBox())!;
    const dialogBox = (await dialog.boundingBox())!;
    if (width === 1280) expect(dialogBox.height).toBeCloseTo(633, 0);
    expect(saveBox.x + saveBox.width).toBeCloseTo(dialogBox.x + dialogBox.width - 24, 0);
    expect(saveBox.x - cancelBox.x - cancelBox.width).toBeCloseTo(8, 0);
    expect(cancelBox.x).toBeGreaterThanOrEqual(dialogBox.x + 24);
    if (width >= 390) {
      expect(cancelBox.width).toBe(92);
      expect(saveBox.width).toBe(129);
    }
    await page.screenshot({ path: test.info().outputPath("manual-range.png") });
    await dialog.getByRole("button", { name: "Duração", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: "Duração", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Início / fim", exact: true }).click();
    await expect(dialog.locator('input[name="end"]')).toBeVisible();
    await cancel.click();
    await expect(dialog).toBeHidden();
  });
}
