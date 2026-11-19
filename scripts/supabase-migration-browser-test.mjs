import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { chromium, expect as baseExpect } from "@playwright/test";
import {
  migrationContext,
  businessFingerprint,
  verifyPreserved,
  targetRef,
} from "./lib/migration-test-context.mjs";

import {
  migrationBrowserTransport,
  routeMigrationContext,
  closeMigrationContext,
  setMigrationOffline,
  migrationApiTarget,
} from "./lib/migration-browser-transport.mjs";
import { hostedExtraFlows } from "./lib/migration-hosted-flows.mjs";
const transport = await migrationBrowserTransport();
const appOrigin = transport.appOrigin;
const extrasOnly = process.argv.includes("--extras-only");
assert.ok(!extrasOnly || transport.hosted, "Extra flows require the isolated hosted candidate");
const expect = baseExpect.configure({ timeout: 45000 });
const runId = randomUUID(),
  prefix = `backup/migration-preparation/browser-${runId}`;
const users = [],
  checks = [],
  apiTimings = [];
let ctx,
  before,
  browser,
  workspaceId,
  clientId,
  projectId,
  phase = "preflight",
  failure,
  cleanup;
async function check(name, fn) {
  phase = name;
  console.log(JSON.stringify({ phase, state: "running" }));
  const start = Date.now();
  await fn();
  checks.push({ name, passed: true, ms: Date.now() - start });
  console.log(JSON.stringify(checks.at(-1)));
}
async function waitStored(sql, params, predicate) {
  await expect
    .poll(async () => predicate((await ctx.db.query(sql, params)).rows), {
      timeout: 60000,
      intervals: [1000, 2000, 4000],
    })
    .toBe(true);
}
async function login(user) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    timezoneId: "America/Bahia",
  });
  await routeMigrationContext(context, transport);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const requestTimes = new Map();
  page.on("request", (r) => {
    if (r.url().includes("/api/data")) requestTimes.set(r, Date.now());
  });
  page.on("response", async (r) => {
    if (requestTimes.has(r.request())) {
      const timing = {
        status: r.status(),
        ms: Date.now() - requestTimes.get(r.request()),
        operation: r.request().postDataJSON()?.operation,
      };
      if (r.status() >= 500) {
        const error = await r.json().catch(() => ({}));
        timing.code = error.code ?? null;
        timing.requestId = error.requestId ?? null;
        console.log(JSON.stringify({ hostedApiError: timing }));
      }
      apiTimings.push(timing);
      requestTimes.delete(r.request());
    }
  });
  await page.goto(`${appOrigin}/login`);
  await page.getByLabel(/^(Email|E-mail)\s*\*?$/).fill(user.email);
  await page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(user.password);
  await page.getByRole("button", { name: /^(Sign in|Entrar)$/ }).click();
  await expect(page).toHaveURL(/\/tracker(?:\?.*)?$/);
  await expect(page.locator("#main-content")).toBeVisible();
  return { page, context };
}
async function api(token, body, expected = 200) {
  const target = migrationApiTarget(transport);
  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      ...target.headers,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, expected, `API ${body.operation}`);
  const payload = await response.json();
  return payload.data;
}
try {
  ctx = await migrationContext();
  before = await businessFingerprint(ctx.db);
  await writeFile(prefix + ".before.json", JSON.stringify(before), { flag: "wx", mode: 0o600 });
  for (const role of ["Owner", "Admin", "Member"]) {
    const email = `migration-${runId}-${role.toLowerCase()}@example.invalid`,
      password = randomBytes(30).toString("base64url");
    const created = await ctx.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Migration ${role}` },
      app_metadata: { migration_test: runId },
    });
    assert.equal(created.error, null);
    users.push({ id: created.data.user.id, email, password, role });
    await ctx.preserve(prefix + `-${role}.enc`, { runId, users });
  }
  workspaceId = randomUUID();
  await ctx.db.query("begin");
  await ctx.db.query(
    "insert into public.workspaces(id,name,owner_id) values($1,'Migration browser workspace',$2)",
    [workspaceId, users[0].id],
  );
  for (const user of users) {
    await ctx.db.query(
      "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,$3) on conflict(workspace_id,user_id) do update set role=$3",
      [workspaceId, user.id, user.role],
    );
    await ctx.db.query(
      "insert into public.legal_acceptances(user_id,terms_version,privacy_version,locale) values($1,'2026-09-03','2026-09-03','pt-BR')",
      [user.id],
    );
    await ctx.db.query(
      "update public.user_preferences set active_workspace_id=$2,language='pt-BR',timezone='America/Bahia',theme='light' where user_id=$1",
      [user.id, workspaceId],
    );
  }
  await ctx.db.query("commit");
  await ctx.preserve(prefix + ".workspace.enc", { runId, workspaceId, users });
  browser = await chromium.launch({ headless: true });
  if (extrasOnly) {
    clientId = randomUUID();
    projectId = randomUUID();
    await ctx.db.query(
      "insert into public.clients(id,workspace_id,name) values($1,$2,'Migration client')",
      [clientId, workspaceId],
    );
    await ctx.db.query(
      "insert into public.projects(id,workspace_id,client_id,name) values($1,$2,$3,'Migration project')",
      [projectId, workspaceId, clientId],
    );
    await ctx.db.query(
      "insert into public.time_entries(workspace_id,user_id,project_id,task,date,start_time,end_time,end_date,duration_seconds) values($1,$2,$3,'Migration report fixture','2026-11-01','09:00','09:01','2026-11-01',60)",
      [workspaceId, users[0].id, projectId],
    );
  } else {
    const { page, context } = await login(users[0]);
    await check("client-and-project-ui", async () => {
      await page.goto(`${appOrigin}/clients`);
      await page
        .getByRole("button", { name: /Novo cliente|New client/ })
        .first()
        .click();
      let dialog = page.getByRole("dialog");
      await dialog.getByLabel(/Name|Nome/, { exact: true }).fill("Migration client");
      await dialog.getByRole("button", { name: /Criar cliente|Create client/ }).click();
      await expect(dialog).toHaveCount(0);
      await waitStored(
        "select id from public.clients where workspace_id=$1 and name='Migration client'",
        [workspaceId],
        (rows) => {
          clientId = rows[0]?.id;
          return rows.length === 1;
        },
      );
      await page.goto(`${appOrigin}/projects`);
      await page
        .getByRole("button", { name: /Novo projeto|New project/ })
        .first()
        .click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel(/Name|Nome/, { exact: true }).fill("Migration project");
      await dialog.locator('[data-slot="autocomplete-trigger"]').click();
      await page.getByRole("option", { name: "Migration client", exact: true }).click();
      await dialog.getByRole("button", { name: /Criar projeto|Create project/ }).click();
      await expect(dialog).toHaveCount(0);
      await waitStored(
        "select id from public.projects where workspace_id=$1 and name='Migration project'",
        [workspaceId],
        (rows) => {
          projectId = rows[0]?.id;
          return rows.length === 1;
        },
      );
    });
    await check("empty-timer-reload-complete", async () => {
      await page.goto(`${appOrigin}/tracker`);
      const header = page.locator("[data-header-timer-control]");
      await header.getByRole("button", { name: /^(Iniciar|Start)$/ }).click();
      await expect(header).toHaveAttribute("data-status", "running");
      await waitStored(
        "select task,project_id from public.active_timers where user_id=$1",
        [users[0].id],
        (rows) => rows.length === 1 && rows[0].task === "" && rows[0].project_id === null,
      );
      await page.reload();
      await expect(header).toHaveAttribute("data-status", "running");
      await page.getByRole("button", { name: /^(Stop|Parar)$/ }).click();
      const dialog = page.getByRole("dialog", {
        name: /Concluir registro de tempo|Complete time entry/,
      });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: /^(Salvar|Save)$/ })).toBeDisabled();
      await dialog.getByRole("textbox", { name: /Tarefa|Task/ }).fill("Migration completed task");
      await dialog.locator(".autocomplete__trigger").click();
      await page.getByRole("option", { name: /Migration project/ }).click();
      await dialog.getByRole("button", { name: /^(Salvar|Save)$/ }).click();
      await expect(dialog).toBeHidden();
      await waitStored(
        "select project_id,duration_seconds from public.time_entries where workspace_id=$1 and task='Migration completed task'",
        [workspaceId],
        (rows) =>
          rows.length === 1 && rows[0].project_id === projectId && rows[0].duration_seconds > 0,
      );
    });
    await check("discard-without-hour-record", async () => {
      const previous = (
        await ctx.db.query(
          "select count(*)::int as n from public.time_entries where workspace_id=$1",
          [workspaceId],
        )
      ).rows[0].n;
      const header = page.locator("[data-header-timer-control]");
      await header.getByRole("button", { name: /^(Iniciar|Start)$/ }).click();
      await expect(header).toHaveAttribute("data-status", "running");
      await page.getByRole("button", { name: /^(Stop|Parar)$/ }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^(Descartar tarefa|Discard task)$/ })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /^(Descartar tarefa|Discard task)$/ })
        .click();
      await expect(header).toHaveAttribute("data-status", "idle");
      await waitStored(
        "select 1 from public.active_timers where user_id=$1",
        [users[0].id],
        (rows) => rows.length === 0,
      );
      assert.equal(
        (
          await ctx.db.query(
            "select count(*)::int as n from public.time_entries where workspace_id=$1",
            [workspaceId],
          )
        ).rows[0].n,
        previous,
      );
    });
    await check("completed-task-caret-and-note", async () => {
      const row = page.locator("[data-tracker-entry]").first();
      for (const field of ["task", "description"]) {
        await row.locator(`[data-tracker-field="${field}"]`).click();
        const input = row.locator("input[data-tracker-editor]");
        await input.fill(field === "task" ? "Migration completed task" : "Migration note");
        await input.press("Home");
        await input.pressSequentially("Edited ");
        assert.equal(await input.evaluate((el) => el.selectionStart), 7);
        await input.press("Enter");
      }
      await waitStored(
        "select task,description from public.time_entries where workspace_id=$1",
        [workspaceId],
        (rows) =>
          rows.some(
            (r) =>
              r.task === "Edited Migration completed task" &&
              r.description === "Edited Migration note",
          ),
      );
    });
    await check("offline-edit-and-reconnect", async () => {
      await page.goto(`${appOrigin}/tests/fixtures/durable-recovery.html`);
      await expect(page.getByLabel("Client name")).toHaveText("Migration client");
      await setMigrationOffline(context, true);
      await page.getByRole("button", { name: "Edit fixture client" }).click();
      await expect(page.getByLabel("Client name")).toHaveText("Local recovery edit");
      assert.equal(
        (await ctx.db.query("select name from public.clients where id=$1", [clientId])).rows[0]
          .name,
        "Migration client",
      );
      await setMigrationOffline(context, false);
      await waitStored(
        "select name from public.clients where id=$1",
        [clientId],
        (rows) => rows[0]?.name === "Local recovery edit",
      );
      await page.reload();
      await expect(page.getByLabel("Client name")).toHaveText("Local recovery edit");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
    await check("offline-timer-stop-no-duplicates", async () => {
      const oldCount = (
        await ctx.db.query(
          "select count(*)::int as n from public.time_entries where workspace_id=$1",
          [workspaceId],
        )
      ).rows[0].n;
      await page.getByRole("button", { name: "Start fixture timer", exact: true }).click();
      await waitStored(
        "select status from public.active_timers where user_id=$1",
        [users[0].id],
        (r) => r[0]?.status === "running",
      );
      await setMigrationOffline(context, true);
      await page.getByRole("button", { name: "Stop fixture timer", exact: true }).click();
      await expect(page.getByLabel("Timer status")).toHaveText("idle");
      await setMigrationOffline(context, false);
      await waitStored(
        "select count(*)::int as n from public.time_entries where workspace_id=$1",
        [workspaceId],
        (r) => r[0].n === oldCount + 1,
      );
      await page.evaluate(() => {
        globalThis.dispatchEvent(new globalThis.Event("online"));
        globalThis.dispatchEvent(new globalThis.Event("online"));
      });
      await page.reload();
      await expect(page.getByLabel("Timer status")).toHaveText("idle");
      assert.equal(
        (
          await ctx.db.query(
            "select count(*)::int as n from public.time_entries where workspace_id=$1",
            [workspaceId],
          )
        ).rows[0].n,
        oldCount + 1,
      );
    });
    await check("real-conflict-requires-review", async () => {
      await ctx.db.query("update public.clients set name='Before conflict' where id=$1", [
        clientId,
      ]);
      await page.reload();
      await expect(page.getByLabel("Client name")).toHaveText("Before conflict");
      await setMigrationOffline(context, true);
      await page.getByRole("button", { name: "Edit fixture client" }).click();
      await ctx.db.query("update public.clients set name='Concurrent server edit' where id=$1", [
        clientId,
      ]);
      await setMigrationOffline(context, false);
      await page.getByRole("button", { name: "Resolver alterações pendentes" }).click();
      await expect(page.getByRole("dialog")).toContainText("Concurrent server edit");
      await expect(
        page.getByRole("button", { name: "Recuperar alterações", exact: true }),
      ).toBeDisabled();
      assert.equal(
        (await ctx.db.query("select name from public.clients where id=$1", [clientId])).rows[0]
          .name,
        "Concurrent server edit",
      );
      await page.getByRole("button", { name: "Usar servidor", exact: true }).click();
      await page.getByRole("button", { name: "Recuperar alterações", exact: true }).click();
      await expect(page.getByLabel("Client name")).toHaveText("Concurrent server edit");
    });
    await check("report-download-csv-xlsx-pdf", async () => {
      await page.goto(
        `${appOrigin}/reports?view=detailed&preset=custom&start=2026-11-01&end=2026-11-30`,
      );
      await page.getByRole("button", { name: /^(Exportar|Export)$/ }).click();
      const dialog = page.getByRole("dialog");
      for (const format of ["csv", "xlsx", "pdf"]) {
        await dialog.getByText(format.toUpperCase(), { exact: true }).click();
        const pending = page.waitForEvent("download", { timeout: 60000 });
        await dialog.getByRole("button", { name: /^(Exportar|Export)$/ }).click();
        const download = await pending;
        assert.match(
          download.suggestedFilename(),
          new RegExp(`01-11-2026 a 30-11-2026\\.${format}$`),
        );
        assert.equal(await download.failure(), null);
        const file = prefix + "." + format;
        await download.saveAs(file);
        const bytes = await readFile(file);
        assert.ok(bytes.length > 100);
        if (format === "csv")
          assert.ok(bytes.toString().includes("Edited Migration completed task"));
        if (format === "pdf") assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
        if (format === "xlsx") assert.equal(bytes.subarray(0, 2).toString(), "PK");
      }
    });
    await page.screenshot({ path: prefix + ".png" });
    await closeMigrationContext(context);
    await check("admin-member-permissions-ui", async () => {
      for (const user of users.slice(1)) {
        const session = await login(user);
        for (const route of ["projects", "clients", "team", "reports", "settings"]) {
          await session.page.goto(`${appOrigin}/${route}`);
          await expect(session.page.locator("#main-content")).toBeVisible();
          await expect(
            session.page.getByText("Não conseguimos carregar sua conta.", { exact: true }),
          ).toHaveCount(0);
        }
        await closeMigrationContext(session.context);
      }
    });
  }
  if (transport.hosted)
    await hostedExtraFlows({
      ctx,
      users,
      workspaceId,
      projectId,
      browser,
      transport,
      api,
      check,
      runId,
      prefix,
    });
  await check("avatar-upload-replace-remove-and-logout", async () => {
    const auth = ctx.auth();
    const signedIn = await auth.auth.signInWithPassword({
      email: users[0].email,
      password: users[0].password,
    });
    assert.equal(signedIn.error, null);
    const token = signedIn.data.session.access_token;
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=";
    const url = await api(token, { operation: "uploadAvatar", avatarDataUrl: png });
    assert.equal(new URL(url).host, `${targetRef}.supabase.co`);
    assert.equal((await fetch(url)).status, 200);
    const oldPath = (
      await ctx.db.query("select avatar_path from public.profiles where id=$1", [users[0].id])
    ).rows[0].avatar_path;
    await api(token, { operation: "uploadAvatar", avatarDataUrl: png });
    assert.equal(
      (
        await ctx.db.query("select 1 from storage.objects where bucket_id='avatars' and name=$1", [
          oldPath,
        ])
      ).rowCount,
      0,
    );
    await api(token, { operation: "removeAvatar" });
    assert.equal(
      (
        await ctx.db.query(
          "select 1 from storage.objects where bucket_id='avatars' and name like $1",
          [users[0].id + "/%"],
        )
      ).rowCount,
      0,
    );
    assert.equal((await auth.auth.signOut()).error, null);
    await api(token, { operation: "loadAccount" }, 401);
  });
  await check("account-deletion-request-cancel-only-synthetic", async () => {
    const user = users[2],
      auth = ctx.auth();
    const session = await auth.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    assert.equal(session.error, null);
    const token = session.data.session.access_token;
    const requested = await api(token, {
      operation: "requestAccountDeletion",
      confirmation: user.email,
    });
    assert.equal(requested.status, "pending");
    await api(token, { operation: "loadAccount" }, 423);
    await api(token, { operation: "cancelAccountDeletion" });
    await api(token, { operation: "loadAccount" });
  });
  assert.deepEqual(transport.proxyErrors ?? [], [], "No unhandled proxy failures allowed");
  assert.equal(
    apiTimings.filter((t) => t.status >= 500).length,
    0,
    "No server errors allowed in a passing browser validation",
  );
} catch (error) {
  failure = { phase, code: error.code ?? "BROWSER_TEST_FAILED" };
  if (ctx) await ctx.preserve(prefix + ".failure.enc", { message: error.message }).catch(() => {});
  if (browser)
    for (const context of browser.contexts()) {
      for (const page of context.pages())
        await page.screenshot({ path: prefix + "-failure.png" }).catch(() => {});
    }
} finally {
  if (browser) {
    for (const context of browser.contexts()) await closeMigrationContext(context);
    await browser.close();
  }
  if (ctx) {
    try {
      await ctx.db.query("rollback");
      for (const user of users) {
        const identity = await ctx.admin.auth.admin.getUserById(user.id);
        assert.equal(identity.data.user.app_metadata.migration_test, runId);
        const photos = (
          await ctx.db.query(
            "select name from storage.objects where bucket_id='avatars' and name like $1",
            [user.id + "/%"],
          )
        ).rows.map((r) => r.name);
        if (photos.length)
          assert.equal((await ctx.admin.storage.from("avatars").remove(photos)).error, null);
      }
      await ctx.db.query("begin");
      const cleanupIds = users.map((u) => u.id);
      await ctx.db.query("delete from public.transactional_emails where user_id=any($1::text[])", [
        cleanupIds,
      ]);
      if (workspaceId)
        await ctx.db.query("delete from public.workspaces where id=$1 and owner_id=$2", [
          workspaceId,
          users[0]?.id,
        ]);
      const ids = users.map((u) => u.id);
      await ctx.db.query(
        "delete from public.account_deletion_requests where user_id=any($1::text[])",
        [ids],
      );
      await ctx.db.query("delete from public.profiles where id=any($1::text[])", [ids]);
      await ctx.db.query("delete from public.read_revisions where scope_id=any($1::text[])", [
        [...ids, workspaceId, ...ids.map((id) => `${workspaceId}:${id}`)].filter(Boolean),
      ]);
      await ctx.db.query("commit");
      for (const user of users)
        assert.equal((await ctx.admin.auth.admin.deleteUser(user.id)).error, null);
      cleanup = await verifyPreserved(ctx.db, before);
    } catch (error) {
      failure ??= { phase: "cleanup", code: error.code ?? "CLEANUP_FAILED" };
      await ctx.db.query("rollback").catch(() => {});
    }
    await ctx.db.end();
  }
  const evidence = {
    targetRef,
    appOrigin,
    hosted: transport.hosted,
    scope: extrasOnly ? "hosted-extras-only" : "full",
    productionOriginRehearsal: transport.hosted && transport.appOrigin !== transport.hostOrigin,
    runId,
    checks,
    apiTimings,
    cleanup,
    failure: failure ?? null,
    productionChanged: false,
    completedAt: new Date().toISOString(),
  };
  await writeFile(prefix + ".json", JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify({
      ...evidence,
      apiTimings: {
        count: apiTimings.length,
        failed: apiTimings.filter((t) => t.status >= 400).length,
      },
    }),
  );
  if (failure) process.exitCode = 1;
}
