import { expect, test } from "@playwright/test";

// Values inspected in Figma UI Kit Toggle 96:285 and 96:284, not screenshots
// generated from the implementation. This fixture has no auth, store or API.
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`switch matches Figma at ${viewport.width}px and supports keyboard`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/tests/visual/controls.html");
    const control = page.locator(".switch__control").first();
    const thumb = page.locator(".switch__thumb").first();
    const toggle = page.getByRole("switch", { name: "Faturável" });
    await expect(control).toHaveCSS("width", "28px");
    await expect(control).toHaveCSS("height", "16px");
    await expect(control).toHaveCSS("border-radius", "999px");
    await expect(control).toHaveCSS("background-color", "rgb(199, 204, 209)");
    await expect(thumb).toHaveCSS("width", "12px");
    await expect(thumb).toHaveCSS("height", "12px");
    await expect(thumb).toHaveCSS("margin-inline-start", "2px");
    await expect(thumb).toHaveCSS("background-color", "rgb(156, 163, 175)");
    await page.screenshot({ path: test.info().outputPath("off.png") });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    await expect(control).toHaveCSS("background-color", "rgb(126, 59, 237)");
    await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(thumb).toHaveCSS("margin-inline-start", "14px");
    await page.screenshot({ path: test.info().outputPath("on-focus.png") });
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    await expect(thumb).toHaveCSS("margin-inline-start", "2px");
    await expect(page.getByRole("switch", { name: "Desabilitado" })).toBeDisabled();
  });
}
