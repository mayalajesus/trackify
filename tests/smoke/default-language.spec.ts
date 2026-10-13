import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

test("new visitors see Portuguese even with an English browser", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await page.goto("/signup");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("heading", { name: "Crie sua conta", exact: true })).toBeVisible();
});
