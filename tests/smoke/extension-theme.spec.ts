import { expect, test } from "@playwright/test";

test("extension connection stays light from boot under a dark system theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    const changes: string[] = [];
    Object.assign(window, { connectionThemeChanges: changes });
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.oldValue) changes.push(record.oldValue);
      }
      changes.push(document.documentElement.className);
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
    });
  });
  await page.goto("/extension/connect");
  await expect(page.locator(".auth-page--extension")).toBeVisible();
  await expect(page.locator("html")).toHaveClass("light");
  const changes = await page.evaluate(
    () => (window as unknown as { connectionThemeChanges: string[] }).connectionThemeChanges,
  );
  expect(changes.some((value) => value.split(/\s+/).includes("dark"))).toBe(false);
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass("light");
  // The route override must not overwrite the system preference elsewhere.
  await page.goto("/login");
  await expect(page.locator(".auth-page--login")).toBeVisible();
  await expect(page.locator("html")).toHaveClass("dark");
});
