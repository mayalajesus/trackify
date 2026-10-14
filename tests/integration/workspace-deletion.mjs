// QA fixtures only; every change is rolled back, including successful deletion.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { deleteWorkspace } from "../../server/data/delete-workspace.mjs";
if (process.env.DATABASE_ENV !== "qa") throw Error("QA only");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const owner = randomUUID(),
  member = randomUUID(),
  ws = randomUUID(),
  other = randomUUID(),
  clientId = randomUUID(),
  project = randomUUID();
try {
  await db.query("begin");
  for (const id of [owner, member])
    await db.query(
      "insert into public.profiles(id,name,email) values($1,'QA Workspace Delete',$2)",
      [id, `${id}@example.com`],
    );
  for (const id of [ws, other])
    await db.query("insert into public.workspaces(id,name,owner_id) values($1,'QA Delete',$2)", [
      id,
      owner,
    ]);
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'Member')",
    [ws, member],
  );
  await db.query("insert into public.clients(id,workspace_id,name) values($1,$2,'QA Client')", [
    clientId,
    ws,
  ]);
  await db.query(
    "insert into public.projects(id,workspace_id,client_id,name) values($1,$2,$3,'QA Project')",
    [project, ws, clientId],
  );
  await db.query(
    "insert into public.time_entries(id,workspace_id,user_id,project_id,task,date,end_date,start_time,end_time,duration_seconds) values($1,$2,$3,$4,'QA',current_date,current_date,'09:00','10:00',3600)",
    [randomUUID(), ws, member, project],
  );
  await db.query(
    "insert into public.user_preferences(user_id,active_workspace_id) values($1,$2) on conflict(user_id) do update set active_workspace_id=$2",
    [owner, ws],
  );
  await db.query(
    "insert into public.active_timers(user_id,workspace_id,status,task,project_id,started_date,start_clock) values($1,$2,'paused','QA',$3,current_date,'09:00')",
    [member, ws, project],
  );
  await assert.rejects(
    deleteWorkspace(db, { id: member }, { workspaceId: ws, confirmation: "QA Delete" }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    deleteWorkspace(db, { id: owner }, { workspaceId: ws, confirmation: "QA Delete" }),
    (e) => e.status === 409,
  );
  await db.query("delete from public.active_timers where workspace_id=$1", [ws]);
  await deleteWorkspace(db, { id: owner }, { workspaceId: ws, confirmation: "QA Delete" });
  for (const table of [
    "workspace_members",
    "workspace_settings",
    "time_entries",
    "projects",
    "clients",
    "active_timers",
    "task_invitations",
  ]) {
    assert.equal(
      (
        await db.query(`select count(*)::int as count from public.${table} where workspace_id=$1`, [
          ws,
        ])
      ).rows[0].count,
      0,
    );
  }
  assert.equal(
    (await db.query("select count(*)::int as count from public.workspaces where id=$1", [other]))
      .rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from public.profiles where id=any($1::text[])",
        [[owner, member]],
      )
    ).rows[0].count,
    2,
  );
  assert.equal(
    (
      await db.query("select active_workspace_id from public.user_preferences where user_id=$1", [
        owner,
      ])
    ).rows[0].active_workspace_id,
    null,
  );
  console.log(
    "Workspace deletion: permission, active timer, cascading deletion, preferences and isolation passed (rolled back).",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
