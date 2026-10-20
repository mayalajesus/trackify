import { expect, test } from "@playwright/test";
import { getLocalToday } from "../../src/lib/format";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";

test("inline entry editing saves task and precise duration and cancels unfinished edits", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  const entry = fixture.account!.workspaces[0]!.entries[0]!;
  entry.date = getLocalToday();
  entry.endDate = entry.date;
  await page.reload();
  const row = page.locator("[data-tracker-entry]").first();
  await expect(row).toBeVisible();
  await row.locator('[data-tracker-field="task"]').click();
  const task = row.getByRole("textbox", { name: /^(Task|Tarefa)$/ });
  await task.fill("E2E edited task");
  await task.press("Enter");
  await expect.poll(() => fixture.account!.workspaces[0]!.entries[0]!.task).toBe("E2E edited task");
  await row.locator('[data-tracker-field="duration"]').click();
  const duration = row.getByRole("textbox", { name: /^(Duration|Duração)$/ });
  await duration.fill("00:02:30");
  await duration.press("Enter");
  await expect.poll(() => fixture.account!.workspaces[0]!.entries[0]!.seconds).toBe(150);
  await row.locator('[data-tracker-field="task"]').click();
  await task.fill("Discard this unfinished edit");
  await task.press("Escape");
  await expect(row.locator('[data-tracker-field="task"]')).toHaveText("E2E edited task");
  expect(fixture.account!.workspaces[0]!.entries[0]!.task).toBe("E2E edited task");
  await page.reload();
  await expect(row.locator('[data-tracker-field="task"]')).toHaveText("E2E edited task");
  await row.locator('[data-tracker-field="duration"]').click();
  await expect(duration).toHaveValue("150s");
  await duration.press("Escape");
});

test("team invitations preserve input after failure and reset the form after success", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  let attempts = 0;
  await page.route("**/api/data", async (route) => {
    const body = route.request().postDataJSON();
    if (body.operation !== "createInvitationLink") return route.fallback();
    attempts += 1;
    if (attempts === 1)
      return route.fulfill({ status: 503, json: { error: "Temporary invitation failure" } });
    const member = {
      id: "55555555-5555-4555-8555-555555555555",
      name: "QA Invite",
      email: body.email,
      role: body.role,
      status: "invited",
      initials: "QI",
    };
    const account = fixture.account!;
    account.identities.push({
      id: member.id,
      name: member.name,
      email: member.email,
      initials: member.initials,
    });
    account.workspaces[0]!.memberships.push({
      workspaceId: account.workspaces[0]!.workspace.id,
      userId: member.id,
      role: body.role,
      status: "invited",
      hourlyRate: 0,
      currency: "BRL",
    });
    return route.fulfill({
      json: {
        data: {
          member,
          invitationUrl: "https://example.test/invite/qa-fixture",
          emailStatus: "disabled",
        },
      },
    });
  });
  await signInAs(page, "owner");
  await page.goto("/team");
  const invite = page.getByRole("button", { name: /^(Invite member|Convidar membro)$/ });
  await invite.click();
  const dialog = page.getByRole("dialog");
  const email = dialog.getByLabel(/^(Email|E-mail)\s*\*?$/);
  await email.fill("qa-invitation@example.test");
  const submit = dialog.getByRole("button", {
    name: /Create invitation link|Criar link de convite/,
  });
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("Temporary invitation failure");
  await expect(email).toHaveValue("qa-invitation@example.test");
  await submit.click();
  await expect(dialog.getByLabel(/Invitation link|Link do convite/)).toHaveValue(
    "https://example.test/invite/qa-fixture",
  );
  expect(attempts).toBe(2);
  await dialog.getByRole("button", { name: /^(Done|Concluir)$/ }).click();
  await expect(dialog).toHaveCount(0);
  await invite.click();
  await expect(email).toBeEmpty();
  await expect(
    dialog.getByRole("button", {
      name: /Choose invitation role|Escolher função da pessoa convidada/,
    }),
  ).toContainText(/Member|Membro/);
});
