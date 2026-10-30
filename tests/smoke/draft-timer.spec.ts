import { expect, test } from "@playwright/test";
import { installAccountFixture } from "../support/account-fixture";
import { signInAs } from "../support/qa-auth";

test("header starts an empty timer, reload preserves it and completion saves one valid entry", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  const header = page.locator("[data-header-timer-control]");
  await header.getByRole("button", { name: /^(Iniciar|Start)$/ }).click();
  await expect(header).toHaveAttribute("data-status", "running");
  await expect.poll(() => fixture.timer?.status).toBe("running");
  expect(fixture.timer).toMatchObject({ task: "", projectId: null });
  await page.reload();
  await expect(header).toHaveAttribute("data-status", "running");
  await page.getByRole("button", { name: /^(Stop|Parar)$/ }).click();
  const dialog = page.getByRole("dialog", {
    name: /Concluir registro de tempo|Complete time entry/,
  });
  await expect(dialog).toBeVisible();
  await expect(header).toHaveAttribute("data-status", "paused");
  await expect(dialog.getByRole("button", { name: /^(Salvar|Save)$/ })).toBeDisabled();
  await dialog.getByRole("button", { name: /^(Cancelar|Cancel)$/ }).click();
  await expect(dialog).toBeHidden();
  await expect(header).toHaveAttribute("data-status", "paused");
  await page.getByRole("button", { name: /^(Stop|Parar)$/ }).click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "tmp-report-preview/draft-timer-completion.png" });
  await dialog.getByRole("textbox", { name: /Tarefa|Task/ }).fill("Atendimento inesperado");
  await dialog.locator(".autocomplete__trigger").click();
  await page.getByRole("option", { name: /Fixture project/ }).click();
  await dialog.getByRole("button", { name: /^(Salvar|Save)$/ }).click();
  await expect(dialog).toBeHidden();
  await expect(header).toHaveAttribute("data-status", "idle");
  await expect
    .poll(
      () =>
        fixture.account?.workspaces[0]?.entries.filter((e) => e.task === "Atendimento inesperado")
          .length,
    )
    .toBe(1);
  const entry = fixture.account!.workspaces[0]!.entries.find(
    (e) => e.task === "Atendimento inesperado",
  )!;
  expect(entry.projectId).toBe(fixture.account!.workspaces[0]!.projects[0]!.id);
  expect(entry.seconds).toBeGreaterThan(0);
});
