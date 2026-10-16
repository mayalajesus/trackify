import { expect, test } from "@playwright/test";
import { signInAs } from "../support/qa-auth";

test("integration switch keeps its design before connection, after connection and after disconnect", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  // Keep visual fixtures independent of QA workspace contents and database availability.
  let userId = "";
  await page.route(/\/auth\//, async (route) => {
    const response = await route.fetch();
    const body = await response.json().catch(() => null);
    const user = body?.user ?? body?.data?.user ?? body?.data?.session?.user;
    if (typeof user?.id === "string") userId = user.id;
    await route.fulfill({ response });
  });
  let sessions = 0;
  let failDisconnect = false;
  await page.route("**/api/data", async (route) => {
    const operation = route.request().postDataJSON()?.operation;
    if (operation === "disconnectOwnExtensions" && failDisconnect) {
      await route.fulfill({ status: 503, json: { error: "Não foi possível desconectar." } });
      return;
    }
    if (operation === "disconnectOwnExtensions") sessions = 0;
    if (["getOwnExtensionConnections", "disconnectOwnExtensions"].includes(operation)) {
      await route.fulfill({ json: { data: { sessions } } });
      return;
    }
    if (operation === "getAccountDeletionStatus") {
      await route.fulfill({
        json: {
          data: {
            accountStatus: "active",
            legal: { accepted: true },
            deletion: null,
            ownershipBlockers: [],
          },
        },
      });
      return;
    }
    if (operation === "loadAccount") {
      expect(userId).not.toBe("");
      const workspaceId = "11111111-1111-4111-8111-111111111111";
      await route.fulfill({
        json: {
          data: {
            version: 13,
            identities: [
              { id: userId, name: "Pessoa de teste", email: "qa@example.com", initials: "QA" },
            ],
            workspaces: [
              {
                workspace: {
                  id: workspaceId,
                  ownerId: userId,
                  name: "Workspace de teste",
                  status: "active",
                  logoDataUrl: null,
                  createdAt: "2026-10-01T12:00:00Z",
                },
                memberships: [
                  {
                    workspaceId,
                    userId,
                    role: "Owner",
                    status: "active",
                    hourlyRate: 0,
                    currency: "BRL",
                  },
                ],
                entries: [],
                projects: [],
                clients: [],
                settings: { weekStart: "monday" },
                trello: {
                  status: "disconnected",
                  workspace: null,
                  board: null,
                  lists: [],
                  cards: [],
                  rule: "all",
                  lastSync: null,
                },
              },
            ],
            preferencesByUserId: {
              [userId]: {
                language: "pt-BR",
                theme: "light",
                avatarUrl: null,
                timezone: "America/Bahia",
                activeWorkspaceId: workspaceId,
                reportFilters: {},
              },
            },
          },
        },
      });
      return;
    }
    // No fixture mutation may reach the real QA account.
    await route.fulfill({ json: { data: operation.startsWith("list") ? [] : null } });
  });
  await signInAs(page, "owner");
  await page.goto("/integrations");
  const toggle = page.getByRole("switch", { name: "Conectar Trello" });
  const control = page.locator(".integration-connection-switch .switch__control");
  const thumb = page.locator(".integration-connection-switch .switch__thumb");
  const checkGeometry = async () => {
    await expect(control).toHaveCSS("width", "28px");
    await expect(control).toHaveCSS("height", "16px");
    await expect(control).toHaveCSS("border-radius", "999px");
    await expect(thumb).toHaveCSS("width", "12px");
    await expect(thumb).toHaveCSS("height", "12px");
    await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");
  };
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked({ timeout: 15_000 });
  await checkGeometry();
  await expect(control).toHaveCSS("background-color", "rgb(234, 235, 236)");
  await page.screenshot({ path: testInfo.outputPath("never-connected.png") });
  await expect(page.getByRole("button", { name: "Desconectar", exact: true })).toHaveCount(0);
  sessions = 1;
  await page.reload();
  await expect(toggle).toBeChecked({ timeout: 15_000 });
  await checkGeometry();
  await expect(control).toHaveCSS("background-color", "rgb(126, 59, 237)");
  await page.screenshot({ path: testInfo.outputPath("connected.png") });
  failDisconnect = true;
  await control.click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível desconectar.");
  await expect(toggle).toBeChecked({ timeout: 15_000 });
  failDisconnect = false;
  await toggle.press("Space");
  await expect(toggle).not.toBeChecked({ timeout: 15_000 });
  await expect(toggle).toBeEnabled();
  await checkGeometry();
  await page.reload();
  await expect(toggle).not.toBeChecked({ timeout: 15_000 });
  await checkGeometry();
  await page.screenshot({ path: testInfo.outputPath("disconnected.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkGeometry();
  await control.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("mobile.png") });
});
