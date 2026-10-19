import { expect, test } from "@playwright/test";
import { cleanQaData } from "../support/qa-db.mjs";
import { signInAs } from "../support/qa-auth";

const marker = `E2E ${Date.now()}`;
const clientName = `${marker} Client`;
const projectName = `${marker} Project`;
const trackerProjectName = `${marker} Tracker Project`;
const activeTimerProjectName = `${marker} Active Timer Project`;

function waitForAccountSync(page: import("@playwright/test").Page) {
  return page.waitForResponse((response) => {
    if (!response.url().includes("/api/data") || response.status() !== 200) return false;
    try {
      return response.request().postDataJSON()?.operation === "syncAccount";
    } catch {
      return false;
    }
  });
}

async function createProjectFromTracker(page: import("@playwright/test").Page, name: string) {
  const trackerBar = page.locator("[data-tracker-bar]");
  await trackerBar.locator('[data-project-select] [data-slot="autocomplete-trigger"]').click();
  await page.getByLabel(/Search projects|Buscar projetos/).fill(name);
  await page.getByRole("button", { name: /Create new project|Criar novo projeto/ }).click();

  const projectDialog = page.getByRole("dialog");
  await expect(projectDialog.getByLabel(/Name|Nome/, { exact: true })).toHaveValue(name);
  await projectDialog.locator('[data-slot="autocomplete-trigger"]').click();
  await page.getByRole("option", { name: clientName, exact: true }).click();
  const projectSync = waitForAccountSync(page);
  await projectDialog.getByRole("button", { name: /Create project|Criar projeto/ }).click();
  await projectSync;
  await expect(projectDialog).toHaveCount(0);
  await expect(trackerBar.locator("[data-project-select]")).toContainText(name);
  return trackerBar;
}

test.afterAll(async () => {
  await cleanQaData(marker);
});

test("owner persists client, project and timer data in Neon", async ({ page }) => {
  test.setTimeout(150_000);
  await signInAs(page, "owner");

  await page.goto("/clients");
  await page.getByRole("button", { name: /New client|Novo cliente/ }).click();
  const clientDialog = page.getByRole("dialog");
  await clientDialog.getByLabel(/Name|Nome/, { exact: true }).fill(clientName);
  await clientDialog.getByLabel(/Contact|Contato/, { exact: true }).fill("e2e@example.test");
  const clientSync = waitForAccountSync(page);
  await clientDialog.getByRole("button", { name: /Create client|Criar cliente/ }).click();
  await clientSync;
  await expect(page.getByRole("rowheader", { name: clientName, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("rowheader", { name: clientName, exact: true })).toBeVisible();

  await page.goto("/projects");
  await page.getByRole("button", { name: /New project|Novo projeto/ }).click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.getByLabel(/Name|Nome/, { exact: true }).fill(projectName);
  await projectDialog.locator('[data-slot="autocomplete-trigger"]').click();
  await page.getByRole("option", { name: clientName, exact: true }).click();
  const projectSync = waitForAccountSync(page);
  await projectDialog.getByRole("button", { name: /Create project|Criar projeto/ }).click();
  await projectSync;
  await expect(page.getByRole("link", { name: projectName, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: projectName, exact: true })).toBeVisible();

  await page.goto("/tracker");
  const trackerBar = await createProjectFromTracker(page, trackerProjectName);
  await page
    .getByRole("combobox", {
      name: /What are you working on\?|No que você está trabalhando\?/,
    })
    .fill(`${marker} Timer`);
  await trackerBar.getByRole("button", { name: /Start|Iniciar/, exact: true }).click();
  await expect(trackerBar.getByRole("button", { name: /Stop|Parar/, exact: true })).toBeVisible();
  await createProjectFromTracker(page, activeTimerProjectName);
  await expect(trackerBar.getByRole("button", { name: /Stop|Parar/, exact: true })).toBeVisible();
  await page.waitForTimeout(1100);
  const timerSync = waitForAccountSync(page);
  await trackerBar.getByRole("button", { name: /Stop|Parar/, exact: true }).click();
  await timerSync;
  await expect(page.getByRole("row").filter({ hasText: `${marker} Timer` })).toBeVisible();
  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: `${marker} Timer` })).toBeVisible();
});

for (const role of ["owner", "admin", "member"] as const) {
  test(`${role} can load authenticated private routes with real account data`, async ({ page }) => {
    await signInAs(page, role);
    for (const route of ["/tracker", "/projects", "/clients", "/team", "/reports", "/settings"]) {
      await page.goto(route);
      await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("body")).not.toContainText("The data request failed");
      await expect(page.locator("body")).not.toContainText("A data request failed");
    }
  });
}
