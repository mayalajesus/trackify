import { expect, test, type Page } from "@playwright/test";
import { qaCredentials } from "../support/qa-auth";

async function signIn(page: Page) {
  const credentials = qaCredentials("owner");
  await page.goto("/login");
  await page.getByLabel(/^(Email|E-mail)\s*\*?$/).fill(credentials.email);
  await page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(credentials.password);
  await page.getByRole("button", { name: /^(Sign in|Entrar)$/ }).click();
  await expect(page).toHaveURL(/\/tracker/, { timeout: 30_000 });
}

async function simulateFirstAccess(
  page: Page,
  options: { empty?: boolean; expired?: boolean; loadError?: boolean } = {},
) {
  const accepted: string[] = [];
  const created: string[] = [];
  let joined = false;
  let loads = 0;
  await page.route("**/api/data", async (route) => {
    const body = route.request().postDataJSON();
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (body.operation === "createWorkspace") {
      created.push(body.name);
      return route.abort();
    }
    if (body.operation === "loadAccount" && !joined) {
      return reply({ version: 13, identities: [], workspaces: [], preferencesByUserId: {} });
    }
    if (body.operation === "listPendingInvitations") {
      loads += 1;
      if (options.loadError && loads === 1)
        return route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
      return reply(
        options.empty
          ? []
          : [
              { id: "11111111-1111-4111-8111-111111111111", workspaceName: "Company A" },
              { id: "22222222-2222-4222-8222-222222222222", workspaceName: "Company B" },
            ],
      );
    }
    if (body.operation === "acceptInvitation") {
      accepted.push(body.invitationId);
      if (options.expired)
        return route.fulfill({
          status: 409,
          json: { error: "This invitation is no longer valid." },
        });
      joined = true;
      return reply({ workspaceId: "selected-workspace" });
    }
    return route.continue();
  });
  return { accepted, created };
}

test("first access joins the selected invitation without creating a workspace", async ({
  page,
}) => {
  const calls = await simulateFirstAccess(page);
  await signIn(page);
  await expect(
    page.getByRole("button", { name: /Entrar em Company A|Join Company A/ }),
  ).toBeVisible();
  await expect(page.getByLabel(/Company workspace name|Nome do workspace da empresa/)).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /Entrar em Company B|Join Company B/ }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page).toHaveURL(/\/tracker/);
  expect(calls.accepted).toEqual(["22222222-2222-4222-8222-222222222222"]);
  expect(calls.created).toEqual([]);
});

test("first access without invitations retains workspace creation", async ({ page }) => {
  await simulateFirstAccess(page, { empty: true });
  await signIn(page);
  await expect(
    page.getByLabel(/Company workspace name|Nome do workspace da empresa/),
  ).toBeVisible();
});

test("invitation lookup can be retried without forcing workspace creation", async ({ page }) => {
  await simulateFirstAccess(page, { loadError: true });
  await signIn(page);
  await page.getByRole("button", { name: /Try again|Tentar novamente/ }).click();
  await expect(
    page.getByRole("button", { name: /Entrar em Company A|Join Company A/ }),
  ).toBeVisible();
  await expect(page.getByLabel(/Company workspace name|Nome do workspace da empresa/)).toHaveCount(
    0,
  );
});

test("an invitation that expires before acceptance does not grant access", async ({ page }) => {
  const calls = await simulateFirstAccess(page, { expired: true });
  await signIn(page);
  await page.getByRole("button", { name: /Entrar em Company A|Join Company A/ }).click();
  await expect(
    page.getByText(/This invitation is no longer valid.|Este convite não é mais válido./),
  ).toBeVisible();
  await expect(page.locator("#main-content")).toHaveCount(0);
  expect(calls.created).toEqual([]);
});
