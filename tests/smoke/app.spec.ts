import { expect, test } from "@playwright/test";
import { openAppPage, qaCredentials, signInAs } from "../support/qa-auth";

const routes = [
  "/tracker",
  "/projects",
  "/clients",
  "/team",
  "/reports",
  "/integrations",
  "/settings",
  "/search",
  "/workspaces",
];
const publicRoutes = ["/login", "/signup", "/forgot-password", "/auth/callback", "/invite/accept"];

test("all primary routes reload into the designed app shell", async ({ page }) => {
  await signInAs(page, "owner");
  for (const route of routes) {
    await openAppPage(page, route);
    await expect(page.locator("body")).not.toContainText("Cannot find module");
    await expect(page.locator("body")).not.toContainText("Unexpected token");
  }
});

test("authentication routes reload into a structured page", async ({ page }) => {
  for (const route of publicRoutes) {
    await page.goto(route);
    await expect(page.locator('main[data-page="auth"]'), route).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Cannot find module");
    await expect(page.locator("body")).not.toContainText("Unexpected token");
  }
});

test("settings preserves language and theme controls", async ({ page }) => {
  await signInAs(page, "owner");
  await openAppPage(page, "/settings");
  await expect(page.getByRole("heading", { name: /Settings|Configurações/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Preferences|Preferências/, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: /Light|Claro/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Dark|Escuro/ })).toBeVisible();
  await page.getByRole("radio", { name: /Dark|Escuro/ }).click();
  await expect(page.getByRole("radio", { name: /Dark|Escuro/ })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: /Light|Claro/ }).click();
  await expect(page.getByRole("radio", { name: /Light|Claro/ })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("profile menu is keyboard reachable from the sidebar", async ({ page }) => {
  await signInAs(page, "owner");
  const profile = page.getByRole("button", {
    name: /Open account menu for|Abrir o menu da conta de/,
  });
  await profile.focus();
  await expect(profile).toBeFocused();
  await page.keyboard.press("Enter");
  const settingsItem = page.getByRole("menuitem", { name: /Settings|Configurações/ });
  await expect(settingsItem).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settingsItem).toHaveCount(0);
});

test("account loading failures expose a recoverable error state", async ({ page }) => {
  const credentials = qaCredentials("owner");
  let failNextRequest = true;
  await page.route("**/api/data", async (route) => {
    if (failNextRequest && route.request().postDataJSON()?.operation === "loadAccount") {
      failNextRequest = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "The data request failed." }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/login");
  await page.getByLabel(/^(Email|E-mail)\s*\*?$/).fill(credentials.email);
  await page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(credentials.password);
  await page.getByRole("button", { name: /^(Sign in|Entrar)$/ }).click();
  await expect(
    page.getByRole("heading", {
      name: /We couldn't load your account|Não conseguimos carregar sua conta/,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Try again|Tentar novamente/ }).click();
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
});

test("accounts without a workspace see the company workspace onboarding", async ({ page }) => {
  const credentials = qaCredentials("owner");
  await page.route("**/api/data", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const body = request.postDataJSON() as { operation?: string };
    if (body.operation !== "loadAccount") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { version: 13, identities: [], workspaces: [], preferencesByUserId: {} },
      }),
    });
  });

  await page.goto("/login");
  await page.getByLabel(/^(Email|E-mail)\s*\*?$/).fill(credentials.email);
  await page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(credentials.password);
  await page.getByRole("button", { name: /^(Sign in|Entrar)$/ }).click();

  await expect(page).toHaveURL(/\/tracker(?:\?.*)?$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", {
      name: /Create your company workspace|Crie o workspace da sua empresa/,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel(/Company workspace name|Nome do workspace da empresa/),
  ).toBeVisible();
  await expect(page.locator("#main-content")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sign out|Sair/ })).toBeVisible();
});

test("members cannot access owner and admin actions", async ({ page }) => {
  await signInAs(page, "member");
  await openAppPage(page, "/projects");
  await expect(page.getByRole("button", { name: /New project|Novo projeto/ })).toHaveCount(0);
  await openAppPage(page, "/tracker");
  const trackerBar = page.locator("[data-tracker-bar]");
  await trackerBar.locator('[data-project-select] [data-slot="autocomplete-trigger"]').click();
  await expect(
    page.getByRole("button", { name: /Create new project|Criar novo projeto/ }),
  ).toHaveCount(0);
  await openAppPage(page, "/clients");
  await expect(page.getByRole("button", { name: /New client|Novo cliente/ })).toHaveCount(0);
  await openAppPage(page, "/team");
  await expect(page.getByRole("button", { name: /Invite member|Convidar membro/ })).toHaveCount(0);
});

test("owner opens the complete project form from the tracker search", async ({ page }) => {
  await signInAs(page, "owner");
  await openAppPage(page, "/tracker");
  const trackerBar = page.locator("[data-tracker-bar]");
  const projectTrigger = trackerBar.locator(
    '[data-project-select] [data-slot="autocomplete-trigger"]',
  );

  await projectTrigger.click();
  const projectSearch = page.getByLabel(/Search projects|Buscar projetos/);
  await projectSearch.fill("Website redesign");
  await page.getByRole("button", { name: /Create new project|Criar novo projeto/ }).click();

  const projectDialog = page.getByRole("dialog");
  await expect(projectDialog.getByLabel(/Name|Nome/, { exact: true })).toHaveValue(
    "Website redesign",
  );
  await expect(projectDialog.locator('[data-slot="autocomplete-trigger"]')).toBeVisible();
  await expect(
    projectDialog.getByRole("button", { name: /Add project members|Adicionar membros ao projeto/ }),
  ).toBeVisible();
  await projectDialog.getByRole("button", { name: /Cancel|Cancelar/, exact: true }).click();
  await expect(projectDialog).toHaveCount(0);

  await projectTrigger.click();
  await expect(page.getByLabel(/Search projects|Buscar projetos/)).toHaveValue("");
});
