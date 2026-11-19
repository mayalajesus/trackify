import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { expect as baseExpect } from "@playwright/test";
import {
  routeMigrationContext,
  closeMigrationContext,
  openMigrationAuthLink,
  migrationApiTarget,
} from "./migration-browser-transport.mjs";
import { targetRef } from "./migration-test-context.mjs";

const expect = baseExpect.configure({ timeout: 45000 });
export async function hostedExtraFlows({
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
}) {
  const extra = [],
    origin = transport.appOrigin;
  const serverErrors = [];
  const open = async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "pt-BR",
      timezoneId: "America/Bahia",
    });
    await routeMigrationContext(context, transport);
    const page = await context.newPage();
    page.on("response", (response) => {
      if (response.url().startsWith(origin + "/api/data") && response.status() >= 500)
        serverErrors.push(response.status());
    });
    page.setDefaultTimeout(45000);
    return { context, page };
  };
  const signed = async (user) => {
    const auth = ctx.auth();
    const result = await auth.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    assert.equal(result.error, null);
    return result.data.session.access_token;
  };
  const linkFor = async (user, type, path) => {
    const result = await ctx.admin.auth.admin.generateLink({
      type,
      email: user.email,
      ...(type === "signup" ? { password: user.password } : {}),
      options: { redirectTo: origin + path },
    });
    assert.equal(result.error, null);
    const url = new URL(result.data.properties.action_link);
    assert.equal(url.origin, `https://${targetRef}.supabase.co`);
    assert.equal(url.searchParams.get("redirect_to"), origin + path);
    return url.href;
  };
  let linkUser;
  await check("hosted-confirmation-and-password-recovery-links", async () => {
    const email = `migration-${runId}-links@example.invalid`,
      password = "Trk!8" + randomBytes(25).toString("base64url");
    const created = await ctx.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: "Migration Links" },
      app_metadata: { migration_test: runId },
    });
    assert.equal(created.error, null);
    linkUser = { id: created.data.user.id, email, password, role: "Links" };
    users.push(linkUser);
    await ctx.preserve(prefix + ".link-user.enc", { runId, user: linkUser });
    await ctx.db.query(
      "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'Member')",
      [workspaceId, linkUser.id],
    );
    await ctx.db.query(
      "insert into public.legal_acceptances(user_id,terms_version,privacy_version,locale) values($1,'2026-09-03','2026-09-03','pt-BR')",
      [linkUser.id],
    );
    await ctx.db.query(
      "update public.user_preferences set active_workspace_id=$2,language='pt-BR',timezone='America/Bahia',theme='light' where user_id=$1",
      [linkUser.id, workspaceId],
    );
    const confirmation = await linkFor(linkUser, "signup", "/auth/callback");
    let session = await open();
    await openMigrationAuthLink(session.page, transport, confirmation);
    await expect(session.page).toHaveURL(origin + "/tracker");
    await expect(session.page.locator("#main-content")).toBeVisible();
    assert.ok((await ctx.admin.auth.admin.getUserById(linkUser.id)).data.user.email_confirmed_at);
    await closeMigrationContext(session.context);
    const recovery = await linkFor(linkUser, "recovery", "/auth/callback?mode=recovery");
    session = await open();
    await openMigrationAuthLink(session.page, transport, recovery);
    await expect(session.page.getByLabel(/^(Password|Senha)\s*\*?$/)).toBeVisible();
    const replacement = "Trk!9" + randomBytes(25).toString("base64url");
    await session.page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(replacement);
    await session.page.getByLabel(/^(Confirm password|Confirmar senha)\s*\*?$/).fill(replacement);
    await session.page.getByRole("button", { name: /Salvar nova senha|Save new password/ }).click();
    await expect(session.page).toHaveURL(origin + "/tracker");
    linkUser.password = replacement;
    await signed(linkUser);
    await closeMigrationContext(session.context);
    session = await open();
    await openMigrationAuthLink(session.page, transport, recovery);
    await expect(
      session.page.getByRole("heading", {
        name: /This link could not be used|Não foi possível usar este link/,
      }),
    ).toBeVisible();
    await expect(session.page.getByLabel(/^(Password|Senha)\s*\*?$/)).toHaveCount(0);
    await closeMigrationContext(session.context);
    extra.push({
      confirmationCallback: true,
      recoveryFormAndNewPasswordLogin: true,
      usedRecoveryLinkRejected: true,
      externalMailSent: false,
    });
  });
  await check("hosted-invitation-link-login-and-acceptance", async () => {
    await ctx.db.query(
      "delete from public.workspace_members where workspace_id=$1 and user_id=$2",
      [workspaceId, linkUser.id],
    );
    const token = await signed(users[0]);
    const invitation = await api(token, {
      operation: "inviteMember",
      workspaceId,
      email: linkUser.email,
      role: "Member",
    });
    assert.equal(new URL(invitation.invitationUrl).origin, origin);
    assert.equal(invitation.emailStatus, "disabled");
    const session = await open();
    await session.page.goto(invitation.invitationUrl);
    await session.page.getByRole("button", { name: /^(Entrar|Sign in)$/ }).click();
    await session.page.getByLabel(/^(Email|E-mail)\s*\*?$/).fill(linkUser.email);
    await session.page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(linkUser.password);
    await session.page.getByRole("button", { name: /^(Entrar|Sign in)$/ }).click();
    await expect(session.page).toHaveURL(origin + "/tracker");
    const membership = await ctx.db.query(
      "select status from public.workspace_members where workspace_id=$1 and user_id=$2",
      [workspaceId, linkUser.id],
    );
    assert.equal(membership.rowCount, 1);
    assert.equal(membership.rows[0].status, "active");
    await closeMigrationContext(session.context);
    extra.push({
      invitationUrlOrigin: origin,
      browserLoginAndAcceptance: true,
      duplicateMembership: false,
      externalMailSent: false,
    });
  });
  await check("hosted-google-authorize-redirect", async () => {
    const auth = ctx.auth();
    const generated = await auth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: origin + "/auth/callback", skipBrowserRedirect: true },
    });
    assert.equal(generated.error, null);
    assert.equal(new URL(generated.data.url).origin, ctx.url);
    const response = await fetch(generated.data.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, "https://accounts.google.com");
    assert.equal(location.searchParams.get("redirect_uri"), ctx.url + "/auth/v1/callback");
    extra.push({
      googleProviderRedirect: true,
      appReturnOrigin: origin,
      limitation:
        "Google credentials/consent not automated; same candidate Google login was previously confirmed by the user locally.",
    });
  });
  await check("hosted-report-private-workspace-logo", async () => {
    const session = await open();
    const storage = ctx.admin.storage.from("workspace-logos");
    const objectPath = `${workspaceId}/migration-${runId}.png`;
    let uploaded = false;
    try {
      await session.page.goto(origin + "/login");
      await session.page.getByLabel(/^(Email|E-mail)\s*\*?$/).fill(users[0].email);
      await session.page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(users[0].password);
      await session.page.getByRole("button", { name: /^(Entrar|Sign in)$/ }).click();
      await expect(session.page).toHaveURL(origin + "/tracker");
      const png = await session.page.evaluate(() => {
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext("2d");
        context.fillStyle = "#7c3aed";
        context.fillRect(0, 0, 16, 16);
        return canvas.toDataURL("image/png").split(",")[1];
      });
      assert.equal(
        (
          await storage.upload(objectPath, Buffer.from(png, "base64"), {
            contentType: "image/png",
            upsert: false,
          })
        ).error,
        null,
      );
      uploaded = true;
      assert.equal(
        (
          await ctx.db.query(
            "update public.workspaces set logo_path=$2 where id=$1 and owner_id=$3",
            [workspaceId, objectPath, users[0].id],
          )
        ).rowCount,
        1,
      );
      await session.page.goto(
        origin + "/reports?view=detailed&preset=custom&start=2026-11-01&end=2026-11-30",
      );
      await session.page.getByRole("button", { name: /^(Exportar|Export)$/ }).click();
      const dialog = session.page.getByRole("dialog");
      await dialog.getByText("PDF", { exact: true }).click();
      const pending = session.page.waitForEvent("download", { timeout: 60000 });
      await dialog.getByRole("button", { name: /^(Exportar|Export)$/ }).click();
      const downloaded = await pending;
      assert.equal(await downloaded.failure(), null);
      const file = prefix + ".logo.pdf";
      await downloaded.saveAs(file);
      const pdf = await PDFDocument.load(await readFile(file));
      const images = pdf.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFRawStream &&
            object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image",
        );
      assert.ok(images.length > 0, "Private workspace logo must be embedded in the exported PDF");
      extra.push({ privateLogoInPdf: true, imageObjects: images.length });
    } finally {
      await closeMigrationContext(session.context);
      await ctx.db.query(
        "update public.workspaces set logo_path=null where id=$1 and owner_id=$2",
        [workspaceId, users[0].id],
      );
      if (uploaded) assert.equal((await storage.remove([objectPath])).error, null);
    }
  });
  await check("hosted-extension-session-refresh-timer-and-revoke", async () => {
    const target = migrationApiTarget(transport);
    const origin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const request = async (token, body, status = 200) => {
      const response = await fetch(target.url, {
        method: "POST",
        headers: {
          ...target.headers,
          origin,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      assert.equal(response.status, status, body.operation);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      return (await response.json()).data;
    };
    const session = await request(await signed(users[1]), { operation: "createExtensionSession" });
    const renewed = await request(session.refreshToken, { operation: "refreshExtensionSession" });
    assert.notEqual(renewed.token, session.token);
    const taskId = randomUUID();
    let { timer } = await request(renewed.token, {
      operation: "extensionTimerAction",
      action: "start",
      workspaceId,
      projectId,
      taskId,
      source: "manual",
      task: "Migration hosted extension",
      description: "Synthetic record",
    });
    assert.equal(timer.status, "running");
    assert.equal(
      (
        await ctx.db.query(
          "update public.active_timers set accumulated_seconds=65 where workspace_id=$1 and user_id=$2 and task_details->>'id'=$3",
          [workspaceId, users[1].id, taskId],
        )
      ).rowCount,
      1,
    );
    ({ timer } = await request(renewed.token, { operation: "getExtensionContext", workspaceId }));
    ({ timer } = await request(renewed.token, {
      operation: "extensionTimerAction",
      action: "pause",
      workspaceId,
      version: timer.version,
    }));
    assert.equal(timer.status, "paused");
    await request(renewed.token, {
      operation: "extensionTimerAction",
      action: "stop",
      workspaceId,
      version: timer.version,
    });
    assert.equal(
      (
        await ctx.db.query(
          "select count(*)::int as n from public.time_entries where workspace_id=$1 and user_id=$2 and task_details->>'id'=$3 and duration_seconds>=65",
          [workspaceId, users[1].id, taskId],
        )
      ).rows[0].n,
      1,
    );
    await request(renewed.token, { operation: "revokeExtensionSession" });
    await request(renewed.token, { operation: "getExtensionContext", workspaceId }, 401);
    extra.push({
      extensionSession: true,
      refresh: true,
      pauseAndStop: true,
      revoke: true,
      chromeOriginCors: true,
      trelloUiAutomated: false,
    });
  });
  await check("hosted-concurrent-read-performance-and-isolation", async () => {
    for (const user of users.slice(0, 3))
      await ctx.db.query(
        `insert into public.time_entries(id,workspace_id,user_id,project_id,task,date,start_time,end_time,end_date,duration_seconds)
        select gen_random_uuid(),$1,$2,$3,'Hosted performance fixture','2026-11-01','09:00','10:00','2026-11-01',3600 from generate_series(1,300)`,
        [workspaceId, user.id, projectId],
      );
    const tokens = await Promise.all(users.slice(0, 3).map(signed));
    const samples = [],
      cached = new Map();
    const read = async (index, operation, conditional) => {
      const key = `${index}:${operation}`,
        start = performance.now();
      const body = {
        operation,
        readProtocol: 1,
        ...(operation === "loadReportEntries"
          ? { workspaceId, startDate: "2026-11-01", endDate: "2026-11-30" }
          : {}),
        ...(conditional ? { ifRevision: cached.get(key) } : {}),
      };
      const data = await api(tokens[index], body);
      const ms = Math.round(performance.now() - start),
        bytes = Buffer.byteLength(JSON.stringify(data));
      if (conditional) assert.equal(data.notModified, true);
      else {
        assert.equal(data.notModified, false);
        cached.set(key, data.revision);
        if (operation === "loadReportEntries") {
          assert.ok(data.data.length >= (index === 2 ? 300 : 900));
          if (index === 2) assert.ok(data.data.every((e) => e.userId === users[2].id));
        }
      }
      samples.push({ index, operation, conditional, ms, bytes });
    };
    // Three users and six simultaneous real requests; bounded workload, not a soak test.
    for (const conditional of [false, true, true, true])
      await Promise.all(
        tokens.flatMap((_, i) =>
          ["loadAccount", "loadReportEntries"].map((op) => read(i, op, conditional)),
        ),
      );
    const times = samples.map((s) => s.ms).sort((a, b) => a - b),
      full = samples.filter((s) => !s.conditional),
      small = samples.filter((s) => s.conditional);
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
    const savedRatio = 1 - mean(small.map((s) => s.bytes)) / mean(full.map((s) => s.bytes));
    assert.ok(savedRatio > 0.9);
    assert.ok(times.at(-1) < 25000, "Hosted requests must finish inside the browser deadline");
    const result = {
      users: 3,
      concurrentRequests: 6,
      samples: samples.length,
      p50Ms: times[Math.floor(times.length * 0.5)],
      p95Ms: times[Math.floor(times.length * 0.95)],
      maxMs: times.at(-1),
      conditionalTransferReduction: savedRatio,
      memberOnlyOwnRecords: true,
      details: samples,
    };
    extra.push(result);
    console.log(JSON.stringify({ hostedPerformance: { ...result, details: undefined } }));
  });
  assert.deepEqual(serverErrors, [], "No server errors allowed in hosted link/media flows");
  await writeFile(prefix + ".hosted-extra.json", JSON.stringify(extra, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
}
