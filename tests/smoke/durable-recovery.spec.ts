import { expect, test } from "@playwright/test";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";
import { initialTimer } from "../../src/lib/store/defaults";

test("a pending edit survives reload and is recovered without duplicating server records", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  await page.goto("/tests/fixtures/durable-recovery.html");
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  fixture.accountSaveFailures = 20;
  await page.getByRole("button", { name: "Edit fixture client" }).click();
  await expect(page.getByLabel("Save error")).toContainText("Temporary account save failure");
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  await page.getByRole("button", { name: "Revisar rascunhos", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revisar", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Nenhum conflito");
  fixture.accountSaveFailures = 0;
  await page.getByRole("button", { name: "Recuperar alterações", exact: true }).click();
  await expect
    .poll(() => fixture.account?.workspaces[0]?.clients[0]?.name)
    .toBe("Local recovery edit");
  expect(fixture.account!.workspaces[0]!.clients).toHaveLength(1);
  await page.reload();
  await expect(page.getByLabel("Client name")).toHaveText("Local recovery edit");
});

test("conflict resolution preserves a recoverable copy and does not silently overwrite the server", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  await page.goto("/tests/fixtures/durable-recovery.html");
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  fixture.account!.workspaces[0]!.clients[0]!.name = "Other session edit";
  await page.getByRole("button", { name: "Edit fixture client" }).click();
  await expect(page.getByLabel("Save error")).toContainText("Concurrent edit");
  await page.getByRole("button", { name: "Resolver alterações pendentes" }).click();
  await expect(
    page.getByRole("button", { name: "Recuperar alterações", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("Other session edit");
  await page.getByRole("button", { name: "Usar servidor", exact: true }).click();
  await page.getByRole("button", { name: "Recuperar alterações", exact: true }).click();
  await expect(page.getByLabel("Client name")).toHaveText("Other session edit");
  await page
    .getByRole("button", { name: "Rascunhos e cópias de recuperação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Cópia preservada");
  expect(fixture.account!.workspaces[0]!.clients[0]!.name).toBe("Other session edit");
});

test("unavailable local storage blocks writes and keeps the edit visible", async ({ page }) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    }),
  );
  await page.goto("/tests/fixtures/durable-recovery.html");
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  await page.getByRole("button", { name: "Edit fixture client" }).click();
  await expect(page.getByLabel("Save error")).toContainText("cópia local");
  await expect(page.getByLabel("Client name")).toHaveText("Local recovery edit");
  expect(fixture.account!.workspaces[0]!.clients[0]!.name).toBe("Fixture client");
});

test("imports a recovery file for its owner and rejects another account's file", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  await page.goto("/tests/fixtures/durable-recovery.html");
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  const baseline = structuredClone(fixture.account!);
  const account = structuredClone(baseline);
  account.workspaces[0]!.clients[0]!.name = "Imported pending edit";
  const draft = {
    version: 1,
    userId: baseline.identities[0]!.id,
    baseline,
    account,
    workspaceId: baseline.workspaces[0]!.workspace.id,
    timer: initialTimer,
    timerPending: false,
  };
  await page
    .getByRole("button", { name: "Rascunhos e cópias de recuperação", exact: true })
    .click();
  const upload = page.getByLabel("Importar cópia de recuperação", { exact: true });
  await upload.setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...draft, userId: "another-user" })),
  });
  await expect(page.getByRole("dialog")).toContainText("não é um rascunho válido desta conta");
  await upload.setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(draft)),
  });
  await page.getByRole("dialog").getByRole("button", { name: "Revisar", exact: true }).click();
  await page.getByRole("button", { name: "Recuperar alterações", exact: true }).click();
  await expect
    .poll(() => fixture.account?.workspaces[0]?.clients[0]?.name)
    .toBe("Imported pending edit");
});
