import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cutoverContext, targetRef, origin } from "./lib/migration-cutover-context.mjs";

const c = await cutoverContext(),
  st = await c.recover("cutover-deployments-20261119");
const vars = st.variables,
  options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, options);
const auth = createClient(vars.SUPABASE_URL, vars.SUPABASE_ANON_KEY, options);
const runId = randomUUID(),
  email = `migration-cutover-${runId}@example.invalid`,
  password = "Trk!" + randomBytes(30).toString("base64url");
const db = await c.db("target"),
  checks = [];
let userId, workspaceId, failed;
async function cleanupSynthetic() {
  if (!userId) return;
  const identity = await admin.auth.admin.getUserById(userId);
  assert.equal(identity.data.user.email, email);
  assert.equal(identity.data.user.app_metadata.migration_test, runId);
  const owned = (
    await db.query("select id::text from public.workspaces where owner_id=$1", [userId])
  ).rows.map((r) => r.id);
  assert.ok(owned.every((id) => id === workspaceId));
  await db.query("BEGIN");
  try {
    await db.query("delete from public.workspaces where owner_id=$1 and id=any($2::uuid[])", [
      userId,
      owned,
    ]);
    await db.query("delete from public.profiles where id=$1 and email=$2", [userId, email]);
    await db.query("delete from public.read_revisions where scope_id=any($1::text[])", [
      [userId, ...owned, ...owned.map((id) => `${id}:${userId}`)],
    ]);
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
  assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
  assert.equal((await db.query("select id from auth.users where id=$1", [userId])).rowCount, 0);
}
async function api(token, body, status = 200) {
  const r = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { origin, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(r.status, status, body.operation);
  checks.push({ operation: body.operation, status: r.status });
  return (await r.json()).data;
}
try {
  const beforeIds = (await db.query("select id::text from auth.users")).rows.map((r) => r.id);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from pg_trigger where tgname='trackify_cutover_readonly'",
      )
    ).rows[0].n,
    0,
  );
  const health = await fetch(`${origin}/api/health?deep=1`, {
    headers: { authorization: `Bearer ${vars.HEALTHCHECK_SECRET}` },
  });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).database, "reachable");
  checks.push({ deepHealth: true });
  await api("invalid", { operation: "loadAccount" }, 401);
  const oauth = new URL(`${vars.SUPABASE_URL}/auth/v1/authorize`);
  oauth.searchParams.set("provider", "google");
  oauth.searchParams.set("redirect_to", `${origin}/auth/callback`);
  const google = await fetch(oauth, { redirect: "manual" });
  assert.equal(google.status, 302);
  const go = new URL(google.headers.get("location"));
  assert.equal(go.hostname, "accounts.google.com");
  assert.equal(go.searchParams.get("redirect_uri"), `${vars.SUPABASE_URL}/auth/v1/callback`);
  checks.push({ googleAuthorizationRedirect: true, interactiveGoogleLoginNotAutomated: true });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Migration cutover validation" },
    app_metadata: { migration_test: runId },
  });
  assert.equal(created.error, null);
  userId = created.data.user.id;
  assert.ok(!beforeIds.includes(userId));
  await c.preserve(`cutover-smoke-fixture-${runId}`, { userId, email, runId });
  const signed = await auth.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null);
  assert.equal(signed.data.user.id, userId);
  const renewed = await auth.auth.refreshSession();
  assert.equal(renewed.error, null);
  const token = renewed.data.session.access_token;
  await api(token, { operation: "acceptLegalTerms", locale: "pt-BR" });
  const account = await api(token, { operation: "loadAccount", readProtocol: 1 });
  assert.equal(account.data.workspaces.length, 0);
  const cached = await api(token, {
    operation: "loadAccount",
    readProtocol: 1,
    ifRevision: account.revision,
  });
  assert.equal(cached.notModified, true);
  workspaceId = (
    await api(token, {
      operation: "createWorkspace",
      name: `Migration cutover ${runId}`,
      hourlyRate: 100,
      currency: "BRL",
    })
  ).workspaceId;
  const other = (
    await db.query("select id::text from public.workspaces where owner_id<>$1 limit 1", [userId])
  ).rows[0].id;
  await api(
    token,
    {
      operation: "loadReportEntries",
      workspaceId: other,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    },
    403,
  );
  const files = (
    await db.query("select bucket_id,name from storage.objects order by bucket_id,name")
  ).rows;
  for (const file of files) {
    const r = await admin.storage.from(file.bucket_id).download(file.name);
    assert.equal(r.error, null);
    const bytes = Buffer.from(await r.data.arrayBuffer());
    checks.push({
      privateFile: true,
      bucket: file.bucket_id,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const logout = await auth.auth.signOut();
  assert.equal(logout.error, null);
  await api(token, { operation: "loadAccount" }, 401);
  checks.push({ passwordLogin: true, refresh: true, logout: true, scopedWorkspaceWrite: true });
} catch (e) {
  failed = { name: e.name, message: e.message };
  await c.preserve(`cutover-smoke-failure-${runId}`, { ...failed, stack: e.stack });
} finally {
  await cleanupSynthetic();
  const counts = (
    await db.query(
      "select (select count(*)::int from auth.users) as accounts,(select count(*)::int from public.workspaces) as workspaces,(select count(*)::int from public.time_entries) as time_entries,(select count(*)::int from storage.objects) as files",
    )
  ).rows[0];
  await db.end();
  const result = {
    completedAt: new Date().toISOString(),
    targetRef,
    origin,
    passed: !failed,
    syntheticUserRemoved: Boolean(userId),
    checks,
    counts,
  };
  await c.evidence(`cutover-production-smoke-${runId}`, result);
  console.log(JSON.stringify(result));
  if (failed) process.exitCode = 1;
}
