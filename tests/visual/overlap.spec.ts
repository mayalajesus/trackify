import { expect, test } from "@playwright/test";

for (const width of [1280, 390, 320]) {
  test(`overlap confirmation fits ${width}px and preserves both actions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tests/visual/overlap.html");
    await page.getByRole("button", { name: "Abrir confirmação" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator(".alert-dialog__container")).not.toHaveAttribute(
      "data-entering",
      "true",
    );
    await expect(dialog).toHaveCSS("border-radius", "24px");
    await expect(dialog).toHaveCSS("padding", "28px 24px 24px");
    const save = dialog.getByRole("button", { name: "Salvar mesmo assim" });
    const cancel = dialog.getByRole("button", { name: "Cancelar" });
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBe(Math.min(384, width - 32));
    expect(bounds!.x).toBeGreaterThanOrEqual(16);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 16);
    const saveBounds = await save.boundingBox();
    const cancelBounds = await cancel.boundingBox();
    expect(saveBounds!.width).toBe(cancelBounds!.width);
    expect(saveBounds!.height).toBe(cancelBounds!.height);
    if (width >= 390) expect(saveBounds!.height).toBe(36);
    await page.screenshot({ path: test.info().outputPath("confirmation.png") });
    await cancel.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Cancelado");
    await page.getByRole("button", { name: "Abrir confirmação" }).click();
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Confirmado");
  });
}
