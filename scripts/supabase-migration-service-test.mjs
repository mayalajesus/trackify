import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";
import { stagingVerificationSql } from "./lib/migration-stage-plan.mjs";
import { sealArchive, openArchive } from "./lib/migration-archive.mjs";
import { assertMigrationCandidate } from "./lib/migration-project-status.mjs";

const targetRef = "gfedmrhckghmgssgfwis",
  sourceRef = "qgqwvyprivwvffuewzmp";
let phase = "preflight";
async function main() {
  assertMigrationCandidate(targetRef);
  loadEnvFile(".env.migration.local");
  if (process.env.MIGRATION_TARGET_IS_PRODUCTION === "true")
    throw new Error("Candidate is now production; migration service fixtures are disabled.");
  loadEnvFile(".env.backup.local");
  process.env.SENTRY_DSN = "";
  const runId = randomUUID(),
    email = `migration-${runId}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  const output = `backup/migration-preparation/service-test-${runId}`;
  const source = JSON.parse(
    await readFile("backup/migration-preparation/source-audit-20261118.json"),
  );
  const connection = new URL(
    validateConnection(process.env.MIGRATION_TARGET_DATABASE_URL_DIRECT, targetRef),
  );
  connection.searchParams.set("sslmode", "verify-full");
  connection.searchParams.set(
    "sslrootcert",
    path.resolve("backup/migration-preparation/supabase-ca.crt"),
  );
  const db = new pg.Client({
    connectionString: connection.href,
    connectionTimeoutMillis: 60000,
    query_timeout: 120000,
  });
  const apiResponse = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/api-keys`, {
    headers: { Authorization: `Bearer ${process.env.MIGRATION_TARGET_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(apiResponse.status, 200);
  const keys = await apiResponse.json();
  const key = (role) => {
    const k = keys.find((v) => v.name === role)?.api_key;
    const p = JSON.parse(Buffer.from(k?.split(".")[1] ?? "", "base64url"));
    assert.equal(p.ref, targetRef);
    assert.equal(p.role, role);
    return k;
  };
  const url = `https://${targetRef}.supabase.co`,
    admin = createClient(url, key("service_role"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const auth = createClient(url, key("anon"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const env = {
    DATABASE_PROVIDER: "supabase",
    DATABASE_ENV: "migration",
    DATABASE_URL: connection.href,
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: key("anon"),
    SUPABASE_SERVICE_ROLE_KEY: key("service_role"),
    MAILJET_ENABLED: "false",
    APP_URL: "http://localhost:5189",
    TRACKIFY_EXTENSION_IDS: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    SENTRY_DSN: "",
  };
  const { handleDataRequest, getPool, providerEnv } = await import("../server/data-api.mjs");
  const config = providerEnv(env),
    checks = [];
  const request = async (token, body, origin = "http://localhost:5189", expected = 200) => {
    const start = performance.now();
    let payload;
    const response = {
      statusCode: 0,
      setHeader() {},
      end(raw) {
        payload = JSON.parse(raw);
      },
    };
    await handleDataRequest(
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin },
        body,
        socket: { remoteAddress: "127.0.0.1" },
      },
      response,
      env,
    );
    assert.equal(response.statusCode, expected, `Operation ${body.operation} status`);
    checks.push({
      operation: body.operation,
      status: response.statusCode,
      ms: Math.round(performance.now() - start),
    });
    return payload.data;
  };
  let userId,
    workspaceId,
    failure,
    cleanupVerified = false;
  await db.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.query(stagingVerificationSql(source));
    await db.query("COMMIT");
    phase = "synthetic-auth-user";
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Migration validation" },
      app_metadata: { migration_test: runId },
    });
    assert.equal(created.error, null);
    userId = created.data.user.id;
    await writeFile(
      output + ".fixture.enc",
      sealArchive(
        Buffer.from(JSON.stringify({ targetRef, runId, userId, email })),
        process.env.BACKUP_ENCRYPTION_PASSPHRASE,
        targetRef,
      ),
      { flag: "wx", mode: 0o600 },
    );
    phase = "password-login-and-refresh";
    const login = await auth.auth.signInWithPassword({ email, password });
    assert.equal(login.error, null);
    assert.equal(login.data.user.id, userId);
    const refreshed = await auth.auth.refreshSession();
    assert.equal(refreshed.error, null);
    assert.equal(refreshed.data.user.id, userId);
    let token = refreshed.data.session.access_token;
    phase = "application-and-isolation";
    await request(token, { operation: "acceptLegalTerms", locale: "pt-BR" });
    const account = await request(token, { operation: "loadAccount", readProtocol: 1 });
    assert.equal(account.notModified, false);
    assert.equal(account.data.workspaces.length, 0);
    const cached = await request(token, {
      operation: "loadAccount",
      readProtocol: 1,
      ifRevision: account.revision,
    });
    assert.equal(cached.notModified, true);
    const other = (await db.query("select id::text from public.workspaces order by id limit 1"))
      .rows[0].id;
    await request(
      token,
      {
        operation: "loadReportEntries",
        workspaceId: other,
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      },
      undefined,
      403,
    );
    const denied = await auth.from("workspaces").select("id");
    assert.equal(denied.error, null);
    assert.equal(denied.data.length, 0);
    phase = "isolated-workspace";
    const createdWorkspace = await request(token, {
      operation: "createWorkspace",
      name: `Migration validation ${runId}`,
      hourlyRate: 100,
      currency: "BRL",
    });
    workspaceId = createdWorkspace.workspaceId;
    const clientId = randomUUID(),
      projectId = randomUUID();
    await db.query(
      "insert into public.clients(id,workspace_id,name) values($1,$2,'Migration client')",
      [clientId, workspaceId],
    );
    await db.query(
      "insert into public.projects(id,workspace_id,client_id,name) values($1,$2,$3,'Migration project')",
      [projectId, workspaceId, clientId],
    );
    phase = "extension-session-timer";
    const origin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const session = await request(token, { operation: "createExtensionSession" }, origin);
    const renewed = await request(
      session.refreshToken,
      { operation: "refreshExtensionSession" },
      origin,
    );
    assert.notEqual(renewed.token, session.token);
    const extToken = renewed.token;
    const taskId = randomUUID();
    let { timer } = await request(
      extToken,
      {
        operation: "extensionTimerAction",
        action: "start",
        workspaceId,
        projectId,
        taskId,
        source: "manual",
        task: "Migration test",
        description: "Synthetic record",
      },
      origin,
    );
    assert.equal(timer.status, "running");
    await db.query(
      "update public.active_timers set accumulated_seconds=65 where user_id=$1 and workspace_id=$2",
      [userId, workspaceId],
    );
    ({ timer } = await request(
      extToken,
      { operation: "getExtensionContext", workspaceId },
      origin,
    ));
    ({ timer } = await request(
      extToken,
      { operation: "extensionTimerAction", action: "pause", workspaceId, version: timer.version },
      origin,
    ));
    assert.equal(timer.status, "paused");
    await request(
      extToken,
      { operation: "extensionTimerAction", action: "stop", workspaceId, version: timer.version },
      origin,
    );
    const entries = await db.query(
      "select duration_seconds from public.time_entries where workspace_id=$1 and user_id=$2",
      [workspaceId, userId],
    );
    assert.equal(entries.rowCount, 1);
    assert.ok(entries.rows[0].duration_seconds >= 65);
    await request(extToken, { operation: "revokeExtensionSession" }, origin);
    await request(extToken, { operation: "getExtensionContext", workspaceId }, origin, 401);
    phase = "private-media";
    const encrypted = openArchive(
      await readFile("backup/migration-preparation/source-storage-metadata-20261119.json.enc"),
      process.env.BACKUP_ENCRYPTION_PASSPHRASE,
      sourceRef,
    );
    const metadata = JSON.parse(encrypted.plaintext);
    encrypted.plaintext.fill(0);
    for (const object of metadata.objects) {
      const publicUrl = `${url}/storage/v1/object/public/${object.bucket_id}/${object.name.split("/").map(encodeURIComponent).join("/")}`;
      const unauthenticated = await fetch(publicUrl, { signal: AbortSignal.timeout(15000) });
      assert.notEqual(unauthenticated.status, 200);
      await unauthenticated.arrayBuffer();
      const blocked = await auth.storage.from(object.bucket_id).download(object.name);
      assert.ok(blocked.error);
      const signed = await admin.storage.from(object.bucket_id).createSignedUrl(object.name, 60);
      assert.equal(signed.error, null);
      const download = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(15000) });
      assert.equal(download.status, 200);
      const bytes = Buffer.from(await download.arrayBuffer());
      assert.equal(bytes.length, Number(object.metadata.size));
      assert.equal(
        createHash("md5").update(bytes).digest("hex"),
        String(object.metadata.eTag ?? object.metadata.etag).replaceAll('"', ""),
      );
      bytes.fill(0);
    }
    checks.push({
      privateFilesVerified: metadata.objects.length,
      anonymousAndUnrelatedUserDenied: true,
    });
    phase = "password-recovery-without-email";
    const recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "http://localhost:5189/reset-password" },
    });
    assert.equal(recovery.error, null);
    const recovered = await auth.auth.verifyOtp({
      token_hash: recovery.data.properties.hashed_token,
      type: "recovery",
    });
    assert.equal(recovered.error, null);
    assert.equal(recovered.data.user.id, userId);
    const newPassword = randomBytes(32).toString("base64url");
    const changed = await auth.auth.updateUser({ password: newPassword });
    assert.equal(changed.error, null);
    const relogin = await auth.auth.signInWithPassword({ email, password: newPassword });
    assert.equal(relogin.error, null);
    assert.equal(relogin.data.user.id, userId);
    token = relogin.data.session.access_token;
    await request(token, { operation: "loadAccount", readProtocol: 1 });
    checks.push({
      passwordLogin: true,
      refresh: true,
      recoveryWithoutEmail: true,
      googleTested: false,
    });
  } catch (error) {
    failure = {
      phase,
      code: /^[A-Z0-9_]{2,40}$/.test(error.code ?? "") ? error.code : "SERVICE_TEST_FAILED",
    };
  } finally {
    await db.query("ROLLBACK").catch(() => {});
    if (userId) {
      try {
        phase = "cleanup-synthetic-data";
        const identity = await admin.auth.admin.getUserById(userId);
        assert.equal(identity.error, null);
        assert.equal(identity.data.user.email, email);
        assert.equal(identity.data.user.app_metadata.migration_test, runId);
        const workspaces = (
          await db.query("select id::text from public.workspaces where owner_id=$1", [userId])
        ).rows.map((r) => r.id);
        assert.ok(workspaces.every((id) => id === workspaceId));
        await db.query("BEGIN");
        await db.query("delete from public.workspaces where owner_id=$1 and id=any($2::uuid[])", [
          userId,
          workspaces,
        ]);
        await db.query("delete from public.profiles where id=$1 and email=$2", [userId, email]);
        const scopes = [userId, ...workspaces, ...workspaces.map((id) => `${id}:${userId}`)];
        await db.query("delete from public.read_revisions where scope_id=any($1::text[])", [
          scopes,
        ]);
        await db.query("COMMIT");
        const deleted = await admin.auth.admin.deleteUser(userId);
        assert.equal(deleted.error, null);
        await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        await db.query(stagingVerificationSql(source));
        await db.query("COMMIT");
        cleanupVerified = true;
      } catch (error) {
        failure ??= {
          phase,
          code: /^[A-Z0-9_]{2,40}$/.test(error.code ?? "") ? error.code : "CLEANUP_VERIFY_FAILED",
        };
        await db.query("ROLLBACK").catch(() => {});
      }
    }
    await db.end();
    await getPool(config).end();
  }
  const evidence = {
    targetRef,
    runId,
    completedAt: new Date().toISOString(),
    checks,
    cleanupVerified,
    failure,
    productionCutoverAuthorized: false,
  };
  await writeFile(output + ".json", JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(evidence));
  if (failure) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    JSON.stringify({
      error: "Migration service validation failed; check scoped evidence before retrying.",
      phase,
    }),
  );
  process.exitCode = 1;
});
