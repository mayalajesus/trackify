// Real SQL authorization checks. Every fixture and attempted write is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadAccount } from "../../server/data/account.mjs";
import { synchronizeAccount } from "../../server/data/account-sync.mjs";
import { loadReportEntries, upsertOwnEntry } from "../../server/data/entries.mjs";
import { createQaClient } from "../support/qa-fixtures.mjs";

const db = createQaClient("authorization");
const owner = { id: randomUUID(), name: "QA Owner", email: `${randomUUID()}@example.test` };
const member = { id: randomUUID(), name: "QA Member", email: `${randomUUID()}@example.test` };
const outsider = { id: randomUUID(), name: "QA Outsider", email: `${randomUUID()}@example.test` };
const invited = { id: randomUUID(), name: "QA Uninvited", email: `${randomUUID()}@example.test` };
const workspaceId = randomUUID(),
  otherWorkspaceId = randomUUID();
const clientId = randomUUID(),
  foreignClientId = randomUUID();
const projectId = randomUUID(),
  foreignProjectId = randomUUID(),
  entryId = randomUUID();
const config = { databaseProvider: "neon", initialLanguage: "pt-BR" };

async function rejectedWrite(action) {
  await db.query("savepoint rejected_write");
  try {
    await assert.rejects(action, { status: 403 });
  } finally {
    await db.query("rollback to savepoint rejected_write");
    await db.query("release savepoint rejected_write");
  }
}

await db.connect();
try {
  await db.query("begin");
  for (const user of [owner, member, outsider, invited])
    await db.query("insert into public.profiles(id,name,email) values($1,$2,$3)", [
      user.id,
      user.name,
      user.email,
    ]);
  for (const [id, user] of [
    [workspaceId, owner],
    [otherWorkspaceId, outsider],
  ])
    await db.query(
      "insert into public.workspaces(id,name,owner_id) values($1,'QA authorization',$2)",
      [id, user.id],
    );
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'Member')",
    [workspaceId, member.id],
  );
  for (const [id, ws] of [
    [clientId, workspaceId],
    [foreignClientId, otherWorkspaceId],
  ])
    await db.query(
      "insert into public.clients(id,workspace_id,name) values($1,$2,'Original client')",
      [id, ws],
    );
  for (const [id, ws, client] of [
    [projectId, workspaceId, clientId],
    [foreignProjectId, otherWorkspaceId, foreignClientId],
  ])
    await db.query(
      "insert into public.projects(id,workspace_id,client_id,name) values($1,$2,$3,'Original project')",
      [id, ws, client],
    );
  const entry = {
    id: entryId,
    userId: owner.id,
    projectId,
    date: "2026-10-01",
    start: "09:00",
    end: "10:00",
    seconds: 3600,
    task: "Owner entry",
    billable: false,
  };
  await upsertOwnEntry(db, owner.id, workspaceId, entry, entryId);
  await rejectedWrite(() =>
    upsertOwnEntry(
      db,
      member.id,
      workspaceId,
      { ...entry, userId: member.id, task: "Hijacked entry" },
      entryId,
    ),
  );
  await rejectedWrite(() =>
    upsertOwnEntry(
      db,
      outsider.id,
      otherWorkspaceId,
      { ...entry, userId: outsider.id, projectId: foreignProjectId },
      entryId,
    ),
  );
  const reportBody = { workspaceId, startDate: "2026-10-01", endDate: "2026-10-01" };
  await assert.rejects(loadReportEntries(db, outsider, reportBody), { status: 403 });
  assert.equal(
    (await loadReportEntries(db, member, reportBody)).length,
    0,
    "members cannot read another user's entries",
  );
  assert.equal((await loadReportEntries(db, owner, reportBody)).length, 1);

  const baseline = await loadAccount(db, owner, config);
  for (const collection of ["clients", "projects"]) {
    const draft = structuredClone(baseline);
    draft.workspaces[0][collection].push({
      ...draft.workspaces[0][collection][0],
      id: collection === "clients" ? foreignClientId : foreignProjectId,
      name: "Hijacked record",
    });
    await rejectedWrite(() =>
      synchronizeAccount(db, owner, config, { baseAccount: baseline, account: draft }),
    );
  }
  const draft = structuredClone(baseline);
  draft.identities.push({ ...invited, initials: "QU" });
  draft.workspaces[0].memberships.push({
    workspaceId,
    userId: invited.id,
    role: "Member",
    status: "active",
    hourlyRate: 0,
    currency: "BRL",
  });
  await rejectedWrite(() =>
    synchronizeAccount(db, owner, config, { baseAccount: baseline, account: draft }),
  );
  assert.equal(
    (
      await db.query(
        "select 1 from public.workspace_members where workspace_id=$1 and user_id=$2",
        [workspaceId, invited.id],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (await db.query("select task from public.time_entries where id=$1", [entryId])).rows[0].task,
    "Owner entry",
  );
  assert.equal(
    (await db.query("select name from public.clients where id=$1", [foreignClientId])).rows[0].name,
    "Original client",
  );
  assert.equal(
    (await db.query("select name from public.projects where id=$1", [foreignProjectId])).rows[0]
      .name,
    "Original project",
  );
  console.log(
    "PASS: SQL rejects cross-workspace identifiers, foreign entry edits and uninvited membership; report access respects roles. Fixtures rolled back.",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
