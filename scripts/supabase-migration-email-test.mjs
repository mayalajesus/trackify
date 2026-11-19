import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import {
  migrationContext,
  businessFingerprint,
  verifyPreserved,
  targetRef,
} from "./lib/migration-test-context.mjs";
import { openArchive } from "./lib/migration-archive.mjs";
import { processInvitationEmail, acceptInvitation } from "../server/data/invitations.mjs";

// The mailbox must be explicitly supplied for an authorized test. Never iterate
// over imported users or queued mail, and never commit a personal recipient.
const recipientIndex = process.argv.indexOf("--recipient");
let recipient = recipientIndex >= 0 ? process.argv[recipientIndex + 1]?.trim().toLowerCase() : "";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient ?? ""))
  throw new Error("Explicit authorized test recipient required.");
const runId = randomUUID();
const confirmationOnly = process.argv.includes("--confirmation-only");
const output = `backup/migration-preparation/email-test-${runId}`;
let phase = "preflight",
  ctx,
  before,
  userId,
  ownerId,
  workspaceId,
  configBefore,
  subjects,
  mailjet,
  cleanup,
  failure;
const checks = [];
const startedAt = new Date().toISOString();
async function authConfig(method, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.migration.MIGRATION_TARGET_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function mailMessages() {
  const params = new URLSearchParams({
    ContactAlt: recipient,
    ShowSubject: "true",
    FromTS: String(Math.floor(new Date(startedAt).getTime() / 1000)),
    Limit: "20",
  });
  const response = await fetch(`https://api.mailjet.com/v3/REST/message?${params}`, {
    headers: { Authorization: mailjet },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(
    (await response.text()).replace(/("(?:ID|CampaignID|ContactID)"\s*:\s*)(\d{16,})/g, '$1"$2"'),
  );
  return body.Data.map((m) => ({
    id: String(m.ID),
    uuid: m.UUID,
    status: m.Status,
    subject: m.Subject,
  }));
}
try {
  ctx = await migrationContext();
  before = await businessFingerprint(ctx.db);
  const alreadyRegistered =
    (await ctx.db.query("select 1 from auth.users where lower(email)=$1", [recipient])).rowCount >
    0;
  if (alreadyRegistered) {
    const [local, domain] = recipient.split("@");
    assert.ok(
      ["gmail.com", "googlemail.com"].includes(domain),
      "Supply a separate test mailbox; existing account is protected",
    );
    recipient = `${local.split("+")[0]}+trackify-migration-${runId.slice(0, 8)}@${domain}`;
    assert.equal(
      (await ctx.db.query("select 1 from auth.users where lower(email)=$1", [recipient])).rowCount,
      0,
    );
  }
  checks.push({ existingMailboxAccountPreserved: true, usesSeparateGmailAlias: alreadyRegistered });
  const env = parseEnv(await readFile(".env", "utf8"));
  const backup = parseEnv(await readFile(".env.backup.local", "utf8"));
  const archive = openArchive(
    await readFile("backup/migration-preparation/source-service-config-20261118.json.enc"),
    backup.BACKUP_ENCRYPTION_PASSPHRASE,
    "qgqwvyprivwvffuewzmp",
  );
  const source = JSON.parse(archive.plaintext).auth;
  archive.plaintext.fill(0);
  assert.equal(source.smtp_host, "in-v3.mailjet.com");
  assert.equal(source.smtp_user, env.MAILJET_API_KEY);
  mailjet = `Basic ${Buffer.from(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`).toString("base64")}`;
  configBefore = await authConfig("GET");
  await ctx.preserve(output + ".auth-before.enc", configBefore);
  const templateKeys = Object.keys(source).filter((k) =>
    /^mailer_(templates_.*_content|subjects_.*)$/.test(k),
  );
  const templates = Object.fromEntries(templateKeys.map((k) => [k, source[k]]));
  assert.ok(
    !JSON.stringify(templates).includes("qgqwvyprivwvffuewzmp"),
    "Template contains old backend URL",
  );
  subjects = Object.fromEntries(
    templateKeys.filter((k) => k.startsWith("mailer_subjects_")).map((k) => [k, source[k]]),
  );
  phase = "configure-target-smtp";
  await authConfig("PATCH", {
    ...templates,
    ...Object.fromEntries(
      Object.entries(source).filter(
        ([key]) =>
          key.startsWith("rate_limit_") ||
          ["security_captcha_enabled", "security_captcha_provider"].includes(key),
      ),
    ),
    smtp_host: source.smtp_host,
    smtp_port: String(source.smtp_port),
    smtp_user: env.MAILJET_API_KEY,
    smtp_pass: env.MAILJET_SECRET_KEY,
    smtp_admin_email: source.smtp_admin_email,
    smtp_sender_name: source.smtp_sender_name,
    smtp_max_frequency: source.smtp_max_frequency,
    mailer_subjects_confirmation: `[Teste de migração ${runId.slice(0, 8)}] Confirmar conta`,
    mailer_subjects_recovery: `[Teste de migração ${runId.slice(0, 8)}] Recuperar senha`,
  });
  const configured = await authConfig("GET");
  assert.equal(configured.disable_signup, true);
  assert.equal(configured.site_url, "http://localhost:5189");
  assert.equal(configured.smtp_host, source.smtp_host);
  assert.equal(configured.smtp_user, source.smtp_user);
  phase = "synthetic-mail-account";
  const password = randomBytes(32).toString("base64url");
  const created = await ctx.admin.auth.admin.createUser({
    email: recipient,
    password,
    email_confirm: false,
    user_metadata: { full_name: "Teste de migração" },
    app_metadata: { migration_test: runId },
  });
  assert.equal(created.error, null);
  userId = created.data.user.id;
  await ctx.preserve(output + ".fixture.enc", { runId, targetRef, recipient, userId });
  const auth = ctx.auth();
  phase = "send-confirmation";
  const confirmation = await auth.auth.resend({
    type: "signup",
    email: recipient,
    options: { emailRedirectTo: "http://localhost:5189/auth/callback" },
  });
  assert.equal(confirmation.error, null);
  const confirmationHash = (
    await ctx.db.query("select confirmation_token from auth.users where id=$1", [userId])
  ).rows[0].confirmation_token;
  const confirmed = await auth.auth.verifyOtp({ type: "signup", token_hash: confirmationHash });
  assert.equal(confirmed.error, null);
  assert.equal(confirmed.data.user.id, userId);
  checks.push({ confirmationRequestAccepted: true, confirmationTokenVerified: true });
  if (!confirmationOnly) {
    phase = "send-recovery";
    const recovery = await auth.auth.resetPasswordForEmail(recipient, {
      redirectTo: "http://localhost:5189/reset-password",
    });
    assert.equal(recovery.error, null);
    const recoveryHash = (
      await ctx.db.query("select recovery_token from auth.users where id=$1", [userId])
    ).rows[0].recovery_token;
    const recovered = await auth.auth.verifyOtp({ type: "recovery", token_hash: recoveryHash });
    assert.equal(recovered.error, null);
    const newPassword = randomBytes(32).toString("base64url");
    const updated = await auth.auth.updateUser({ password: newPassword });
    assert.equal(updated.error, null);
    assert.equal(
      (await auth.auth.signInWithPassword({ email: recipient, password: newPassword })).error,
      null,
    );
    checks.push({
      recoveryRequestAccepted: true,
      recoveryTokenVerified: true,
      newPasswordLogin: true,
    });
    phase = "invitation-delivery-and-deduplication";
    ownerId = randomUUID();
    workspaceId = randomUUID();
    await ctx.db.query(
      "insert into public.profiles(id,name,email) values($1,'Teste de migração Trackify',$2)",
      [ownerId, `migration-${runId}@example.invalid`],
    );
    await ctx.db.query("insert into public.workspaces(id,name,owner_id) values($1,$2,$3)", [
      workspaceId,
      `Teste de entrega ${runId.slice(0, 8)} (não é um workspace de trabalho)`,
      ownerId,
    ]);
    const user = {
      id: ownerId,
      name: "Validação de entrega (link exclusivo de teste)",
      email: `migration-${runId}@example.invalid`,
    };
    // Delivery is tested with a reserved non-production hostname. Acceptance is
    // separately exercised below against the real candidate, never the old app.
    const config = {
      databaseProvider: "supabase",
      initialLanguage: "pt-BR",
      appUrl: "https://migration-validation.invalid",
      mailjet: {
        enabled: true,
        apiKey: env.MAILJET_API_KEY,
        secretKey: env.MAILJET_SECRET_KEY,
        fromEmail: source.smtp_admin_email,
        fromName: "Trackify — Teste de migração",
      },
    };
    const body = { workspaceId, email: recipient, role: "Member", emailRequestId: randomUUID() };
    const invitation = await processInvitationEmail(ctx.db, user, config, body, false);
    assert.equal(invitation.emailStatus, "accepted");
    const repeated = await processInvitationEmail(ctx.db, user, config, body, false);
    assert.equal(repeated.member.id, invitation.member.id);
    const queued = (
      await ctx.db.query(
        "select attempts,status from public.transactional_emails where invitation_id=$1",
        [invitation.member.id],
      )
    ).rows;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].attempts, 1);
    await ctx.db.query("begin");
    const accepted = await acceptInvitation(
      ctx.db,
      { id: userId, email: recipient, name: "Teste de migração" },
      config,
      { invitationId: invitation.member.id },
    );
    await ctx.db.query("commit");
    assert.equal(accepted.workspaceId, workspaceId);
    checks.push({
      invitationSent: true,
      duplicateRequestSentAgain: false,
      invitationAcceptedInCandidate: true,
      invitationEmailPublicLinkTested: false,
    });
  }
  phase = "verify-delivery";
  let messages = [];
  const deadline = Date.now() + 180000;
  do {
    messages = (await mailMessages()).filter((m) => m.subject?.includes(runId.slice(0, 8)));
    if (
      messages.length >= (confirmationOnly ? 1 : 3) &&
      messages.every((m) => ["sent", "opened", "clicked"].includes(m.status))
    )
      break;
    console.log(
      JSON.stringify({
        phase,
        messages: messages.map((m) => ({
          status: m.status,
          kind: m.subject.includes("Confirmar")
            ? "confirmation"
            : m.subject.includes("Recuperar")
              ? "recovery"
              : "invitation",
        })),
      }),
    );
    await new Promise((r) => setTimeout(r, 10000));
  } while (Date.now() < deadline);
  await ctx.preserve(output + ".delivery.enc", messages);
  checks.push({
    mailjetDelivery: messages.map((m) => ({
      kind: m.subject.includes("Confirmar")
        ? "confirmation"
        : m.subject.includes("Recuperar")
          ? "recovery"
          : "invitation",
      status: m.status,
    })),
    acceptedByRecipientServer:
      messages.length === (confirmationOnly ? 1 : 3) &&
      messages.every((m) => ["sent", "opened", "clicked"].includes(m.status)),
  });
  assert.equal(checks.at(-1).acceptedByRecipientServer, true);
} catch (error) {
  failure = { phase, code: error.code ?? "EMAIL_TEST_FAILED" };
  if (ctx)
    await ctx
      .preserve(output + ".failure.enc", {
        message: error.message,
        actual: error.actual,
        expected: error.expected,
      })
      .catch(() => {});
} finally {
  if (ctx) {
    try {
      await ctx.db.query("rollback");
      if (userId) {
        const u = await ctx.admin.auth.admin.getUserById(userId);
        assert.equal(u.data.user.app_metadata.migration_test, runId);
        assert.equal(u.data.user.email, recipient);
      }
      await ctx.db.query("begin");
      if (ownerId)
        await ctx.db.query("delete from public.transactional_emails where user_id=$1", [ownerId]);
      if (workspaceId)
        await ctx.db.query("delete from public.workspaces where id=$1 and owner_id=$2", [
          workspaceId,
          ownerId,
        ]);
      const ids = [ownerId, userId].filter(Boolean);
      if (ids.length)
        await ctx.db.query("delete from public.profiles where id=any($1::text[])", [ids]);
      await ctx.db.query("delete from public.read_revisions where scope_id=any($1::text[])", [
        [...ids, workspaceId, ...ids.map((id) => `${workspaceId}:${id}`)].filter(Boolean),
      ]);
      await ctx.db.query("commit");
      if (userId) assert.equal((await ctx.admin.auth.admin.deleteUser(userId)).error, null);
      if (subjects) await authConfig("PATCH", subjects);
      cleanup = await verifyPreserved(ctx.db, before);
    } catch (error) {
      failure ??= { phase: "cleanup", code: error.code ?? "CLEANUP_FAILED" };
      await ctx.db.query("rollback").catch(() => {});
    }
    await ctx.db.end();
  }
  const evidence = {
    runId,
    targetRef,
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    cleanup,
    failure: failure ?? null,
    productionChanged: false,
  };
  await writeFile(output + ".json", JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(evidence));
  if (failure) process.exitCode = 1;
}
