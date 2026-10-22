import { expect, test, type Page } from "@playwright/test";
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
  await expect(
    page.getByRole("button", { name: "Rascunhos e cópias de recuperação", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await readDrafts(page)).filter((draft) => draft.archived).length)
    .toBeGreaterThan(0);
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

test("an already saved stop is archived without a false warning or repeated archive cards", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  await page.goto("/tests/fixtures/durable-recovery.html");
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  const account = structuredClone(fixture.account!);
  const userId = account.identities[0]!.id;
  const draft = {
    id: `${userId}:old-tab:workspace`,
    version: 1,
    userId,
    updatedAt: "2026-10-21T19:43:34.000Z",
    account,
    baseline: account,
    workspaceId: account.workspaces[0]!.workspace.id,
    timer: initialTimer,
    timerBaseline: null,
    timerPending: true,
  };
  await page.evaluate(async (draft) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("trackify-recovery", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("drafts", "readwrite");
        const store = tx.objectStore("drafts");
        store.put(draft);
        store.put({ ...draft, id: draft.id + ":archive1", archived: true });
        store.put({ ...draft, id: draft.id + ":archive2", archived: true });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, draft);
  await page.reload();
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  await expect
    .poll(async () => (await readDrafts(page)).find((item) => item.id === draft.id)?.archived)
    .toBe(true);
  await expect(page.getByRole("button", { name: "Revisar rascunhos", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rascunhos e cópias de recuperação", exact: true }),
  ).toHaveCount(0);
  const preserved = await page.evaluate(async () => {
    return new Promise<unknown[]>((resolve) => {
      const request = indexedDB.open("trackify-recovery", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("drafts", "readonly");
        const get = tx.objectStore("drafts").getAll();
        tx.oncomplete = () => {
          db.close();
          resolve(get.result);
        };
      };
    });
  });
  expect(preserved).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: draft.id, archived: true, account })]),
  );
});

test("a successful timer stop clears the journal without needing another user edit", async ({
  page,
}) => {
  const fixture = await installAccountFixture(page);
  await signInAs(page, "owner");
  await page.goto("/tests/fixtures/durable-recovery.html");
  await expect(page.getByLabel("Client name")).toHaveText("Fixture client");
  await page.getByRole("button", { name: "Start fixture timer", exact: true }).click();
  await expect.poll(() => fixture.timer?.status).toBe("running");
  await page.getByRole("button", { name: "Stop fixture timer", exact: true }).click();
  await expect.poll(() => fixture.timer).toBeNull();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        return new Promise<number>((resolve) => {
          const request = indexedDB.open("trackify-recovery", 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("drafts", "readonly");
            const get = tx.objectStore("drafts").getAll();
            tx.oncomplete = () => {
              db.close();
              resolve(get.result.filter((item) => !item.archived).length);
            };
          };
        });
      }),
    )
    .toBe(0);
  await page.reload();
  await expect(page.getByLabel("Timer status")).toHaveText("idle");
  await expect(page.getByRole("button", { name: "Revisar rascunhos", exact: true })).toHaveCount(0);
});

async function readDrafts(page: Page) {
  return page.evaluate(async () => {
    return new Promise<Array<{ id: string; archived?: boolean }>>((resolve, reject) => {
      const request = indexedDB.open("trackify-recovery", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("drafts", "readonly");
        const get = tx.objectStore("drafts").getAll();
        tx.oncomplete = () => {
          db.close();
          resolve(get.result);
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}
