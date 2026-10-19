import { expect, test } from "@playwright/test";
import { signInAs } from "../support/qa-auth";
import { initialPreferences, initialSettings, initialTrello } from "../../src/lib/store/defaults";
import type { PersistedAccount } from "../../src/lib/account-types";
import { mergeAccountChanges } from "../../shared/account-merge.mjs";

const marker = `E2E Save recovery ${Date.now()}`;

test("a failed save keeps the client visible and retries without reloading the account", async ({
  page,
}) => {
  // Exercise browser recovery against an isolated API fixture. Database merge
  // behavior is covered separately by the rollback-only account-sync test.
  let serverAccount: PersistedAccount | null = null;
  let failSave = true;
  let accountLoads = 0;
  await page.route("**/api/data", async (route) => {
    const body = route.request().postDataJSON();
    const operation = body?.operation;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (operation === "getAccountDeletionStatus")
      return reply({
        accountStatus: "active",
        legal: { accepted: true },
        deletion: null,
        ownershipBlockers: [],
      });
    if (operation === "loadAccount") {
      accountLoads += 1;
      if (!serverAccount) {
        const token =
          route
            .request()
            .headers()
            ["authorization"]?.replace(/^Bearer /, "") ?? "";
        const userId = (
          JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
            sub: string;
          }
        ).sub;
        if (!userId) throw new Error("The QA auth token must identify the current user.");
        const workspaceId = "11111111-1111-4111-8111-111111111111";
        serverAccount = {
          version: 13,
          syncProtocol: 1,
          identities: [{ id: userId, name: "QA User", email: "qa@example.test", initials: "QU" }],
          preferencesByUserId: {
            [userId]: { ...initialPreferences, activeWorkspaceId: workspaceId },
          },
          workspaces: [
            {
              workspace: {
                id: workspaceId,
                name: "Recovery QA",
                ownerId: userId,
                logoDataUrl: null,
                status: "active",
                createdAt: "2026-10-01T00:00:00Z",
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
              clients: [],
              projects: [],
              entries: [],
              settings: initialSettings,
              trello: initialTrello,
            },
          ],
        };
      }
      return reply(serverAccount);
    }
    if (operation === "syncAccount" && failSave) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary save failure" }),
      });
      return;
    }
    if (operation === "syncAccount") {
      serverAccount = mergeAccountChanges(body.baseAccount, body.account, serverAccount);
      return reply(serverAccount);
    }
    return reply(operation === "getActiveTimer" ? null : []);
  });
  await signInAs(page, "owner");
  await page.goto("/clients");
  await page
    .getByRole("button", { name: /New client|Novo cliente/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Name|Nome/, { exact: true }).fill(marker);
  await dialog.getByRole("button", { name: /Create client|Criar cliente/ }).click();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: /Your unsaved changes|Suas alterações ainda/ });
  await expect(alert).toBeVisible();
  await expect(page.getByRole("rowheader", { name: marker, exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await alert.getByRole("button", { name: /Download unsaved|Baixar alterações/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("trackify-unsaved-changes.json");
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The recovery download is missing.");
  let recoveryJson = "";
  for await (const chunk of stream) recoveryJson += chunk.toString();
  const recovery = JSON.parse(recoveryJson) as {
    account: { workspaces: Array<{ clients: Array<{ name: string }> }> };
  };
  expect(
    recovery.account.workspaces.some((workspace) =>
      workspace.clients.some((client) => client.name === marker),
    ),
  ).toBe(true);
  const loadsBeforeRetry = accountLoads;
  failSave = false;
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/data") &&
      response.request().postDataJSON()?.operation === "syncAccount" &&
      response.ok(),
  );
  await alert.getByRole("button", { name: /Try saving again|Tentar salvar novamente/ }).click();
  await saved;
  await expect(alert).toHaveCount(0);
  expect(accountLoads).toBe(loadsBeforeRetry);
  await page.reload();
  await expect(page.getByRole("rowheader", { name: marker, exact: true })).toBeVisible();
});
