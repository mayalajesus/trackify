// QA only. Migration, fixtures and writes are rolled back together.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createQaClient } from "../support/qa-fixtures.mjs";
import { conditionalRead, revisionMatches } from "../../server/data/conditional-read.mjs";
import { loadAccount } from "../../server/data/account.mjs";
import { loadReportEntries } from "../../server/data/entries.mjs";
import { extensionContext } from "../../server/data/extension.mjs";

const db = createQaClient("conditional-reads");
const owner = { id: randomUUID(), name: "QA Read Owner", email: `${randomUUID()}@example.test` };
const member = { id: randomUUID(), name: "QA Read Member", email: `${randomUUID()}@example.test` };
const workspaceId = randomUUID(),
  clientId = randomUUID(),
  projectId = randomUUID();
const config = { databaseProvider: "neon", initialLanguage: "pt-BR" };
let queryCount = 0,
  bytes = 0,
  fullHistoryQueries = 0;
const tracked = {
  query: async (sql, params) => {
    queryCount++;
    if (sql.includes("from public.time_entries e") && sql.includes("e.workspace_id = any"))
      fullHistoryQueries++;
    const result = await db.query(sql, params);
    bytes += Buffer.byteLength(JSON.stringify(result.rows));
    return result;
  },
};
const load = (user, operation, extra = {}, revision) =>
  conditionalRead(
    tracked,
    user,
    {
      operation,
      workspaceId,
      ...extra,
      ...(revision ? { ifRevision: revision } : {}),
    },
    () =>
      operation === "loadAccount"
        ? loadAccount(tracked, user, config, { profileEnsured: true })
        : operation === "loadReportEntries"
          ? loadReportEntries(tracked, user, { workspaceId, ...extra })
          : extensionContext(tracked, user, { workspaceId }),
  );
await db.connect();
try {
  await db.query("begin isolation level repeatable read");
  if (!(await db.query("select to_regclass('public.read_revisions') as present")).rows[0].present)
    await db.query(
      await readFile(
        new URL("../../db/migrations/20261118120000_conditional_reads.sql", import.meta.url),
        "utf8",
      ),
    );
  for (const user of [owner, member])
    await db.query(
      "insert into public.profiles(id,name,email,auth_issuer) values($1,$2,$3,'neon')",
      [user.id, user.name, user.email],
    );
  await db.query(
    "insert into public.workspaces(id,name,owner_id) values($1,'QA Conditional Reads',$2)",
    [workspaceId, owner.id],
  );
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role,status) values($1,$2,'Member','active')",
    [workspaceId, member.id],
  );
  await db.query("insert into public.clients(id,workspace_id,name) values($1,$2,'QA Client')", [
    clientId,
    workspaceId,
  ]);
  await db.query(
    "insert into public.projects(id,workspace_id,name,client_id) values($1,$2,'QA Project',$3)",
    [projectId, workspaceId, clientId],
  );
  await db.query(
    `insert into public.time_entries(workspace_id,user_id,project_id,date,start_time,end_time,end_date,duration_seconds,task,billable)
    select $1,$2,$3,'2026-11-01','09:00','10:00','2026-11-01',3600,'QA History ' || n,false from generate_series(1,1000) n`,
    [workspaceId, owner.id, projectId],
  );

  const first = await load(owner, "loadAccount");
  assert.equal(first.notModified, false);
  assert.equal(
    first.data.workspaces.find((w) => w.workspace.id === workspaceId).entries.length,
    1000,
  );
  const memberFirst = await load(member, "loadAccount");
  assert.equal(
    memberFirst.data.workspaces.find((w) => w.workspace.id === workspaceId).entries.length,
    0,
  );
  const period = { startDate: "2026-11-01", endDate: "2026-11-30" };
  const report = await load(owner, "loadReportEntries", period);
  assert.equal(report.data.length, 1000);
  assert.equal((await load(owner, "loadReportEntries", period, report.revision)).notModified, true);
  assert.equal(
    (await load(owner, "loadReportEntries", { ...period, endDate: "2026-11-29" }, report.revision))
      .notModified,
    false,
  );
  const context = await load(owner, "getExtensionContext");
  assert.equal((await load(owner, "getExtensionContext", {}, context.revision)).notModified, true);

  queryCount = bytes = fullHistoryQueries = 0;
  const latencies = [];
  for (let i = 0; i < 20; i++) {
    const started = performance.now();
    await loadAccount(tracked, owner, config, { profileEnsured: true });
    latencies.push(performance.now() - started);
  }
  const baseline = {
    queries: queryCount,
    bytes,
    fullHistoryQueries,
    p95Ms: latencies.sort((a, b) => a - b)[18],
  };
  queryCount = bytes = fullHistoryQueries = 0;
  latencies.length = 0;
  for (let i = 0; i < 20; i++) {
    const started = performance.now();
    assert.equal((await load(owner, "loadAccount", {}, first.revision)).notModified, true);
    latencies.push(performance.now() - started);
  }
  const optimized = {
    queries: queryCount,
    bytes,
    fullHistoryQueries,
    p95Ms: latencies.sort((a, b) => a - b)[18],
  };
  assert.equal(fullHistoryQueries, 0);
  assert.ok(optimized.bytes < baseline.bytes * 0.1);
  assert.ok(optimized.p95Ms <= baseline.p95Ms * 1.1);
  console.log(
    JSON.stringify({
      scenario: "20 unchanged account checks (10-minute cadence), 1000 entries",
      baseline,
      optimized,
      transferredRowBytesReduction: 1 - optimized.bytes / baseline.bytes,
    }),
  );

  await db.query("update public.time_entries set task='Changed remotely' where workspace_id=$1", [
    workspaceId,
  ]);
  assert.equal((await load(owner, "loadAccount", {}, first.revision)).notModified, false);
  assert.equal((await load(member, "loadAccount", {}, memberFirst.revision)).notModified, true);
  assert.equal((await load(owner, "getExtensionContext", {}, context.revision)).notModified, true);
  const changed = await load(owner, "loadAccount");
  await db.query(
    "delete from public.time_entries where id=(select id from public.time_entries where workspace_id=$1 limit 1)",
    [workspaceId],
  );
  assert.equal((await load(owner, "loadAccount", {}, changed.revision)).notModified, false);
  await db.query("update public.clients set color='#123456' where id=$1", [clientId]);
  const changedContext = await load(owner, "getExtensionContext", {}, context.revision);
  assert.equal(changedContext.notModified, false);
  assert.equal(changedContext.data.projects[0].clientColor, "#123456");
  const beforeTimer = await load(owner, "loadAccount");
  await db.query(
    `insert into public.active_timers(user_id,workspace_id,status,task,project_id,started_at,started_date,start_clock)
    values($1,$2,'running','QA Timer',$3,now(),current_date,'09:00')`,
    [owner.id, workspaceId, projectId],
  );
  assert.equal((await load(owner, "loadAccount", {}, beforeTimer.revision)).notModified, true);
  assert.equal(
    (await load(owner, "getExtensionContext", {}, changedContext.revision)).notModified,
    false,
  );
  await db.query("update public.profiles set name='QA Changed Name' where id=$1", [member.id]);
  assert.equal((await load(owner, "loadAccount", {}, beforeTimer.revision)).notModified, false);
  await db.query(
    "update public.workspace_members set status='removed' where workspace_id=$1 and user_id=$2",
    [workspaceId, member.id],
  );
  await assert.rejects(load(member, "loadReportEntries", period, report.revision), { status: 403 });
  assert.equal(
    (await load(member, "loadAccount", {}, memberFirst.revision)).data.workspaces.some(
      (w) => w.workspace.id === workspaceId,
    ),
    false,
  );
  assert.equal(
    revisionMatches(
      first.revision,
      first.revision.split(".")[0],
      Number(first.revision.split(".")[1]),
    ),
    false,
  );
  console.log(
    "PASS: conditional reads, scopes, deletions, profile/client changes, timer isolation, permissions and expiration",
  );
} finally {
  await db.query("rollback");
  assert.equal(
    (
      await db.query("select count(*)::int as n from public.profiles where id=any($1::text[])", [
        [owner.id, member.id],
      ])
    ).rows[0].n,
    0,
  );
  await db.end();
}
