// Isolated QA fixtures, rolled back even after successful timer operations.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { extensionContext, extensionTimerAction } from "../../server/data/extension.mjs";
if (process.env.DATABASE_ENV !== "qa") throw Error("QA only");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const user = { id: randomUUID() },
  stranger = { id: randomUUID() },
  ws = randomUUID(),
  cid = randomUUID(),
  pid = randomUUID(),
  taskId = randomUUID();
const client = {
  query: async (sql, args) => {
    if (sql === "begin") return db.query("savepoint extension_action");
    if (sql === "commit") return db.query("release savepoint extension_action");
    if (sql === "rollback") {
      await db.query("rollback to savepoint extension_action");
      return db.query("release savepoint extension_action");
    }
    return db.query(sql, args);
  },
};
try {
  await db.query("begin");
  await db.query("insert into public.profiles(id,name,email) values($1,'QA Extension',$2)", [
    user.id,
    `${user.id}@example.test`,
  ]);
  await db.query(
    "insert into public.user_preferences(user_id,timezone) values($1,'America/Bahia')",
    [user.id],
  );
  await db.query("insert into public.workspaces(id,name,owner_id) values($1,'QA Extension',$2)", [
    ws,
    user.id,
  ]);
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role,hourly_rate,currency) values($1,$2,'Owner',100,'BRL') on conflict(workspace_id,user_id) do update set hourly_rate=100,currency='BRL'",
    [ws, user.id],
  );
  await db.query(
    "insert into public.clients(id,workspace_id,name,billable) values($1,$2,'QA Client',true)",
    [cid, ws],
  );
  await db.query(
    "insert into public.projects(id,workspace_id,client_id,name,billable) values($1,$2,$3,'QA Project',false)",
    [pid, ws, cid],
  );
  const start = {
    workspaceId: ws,
    action: "start",
    projectId: pid,
    taskId,
    card: { url: "https://trello.com/c/AbCd1234/test?tracking=1", title: "QA Card" },
  };
  await assert.rejects(extensionTimerAction(client, stranger, start), (e) => e.status === 403);
  await assert.rejects(
    extensionTimerAction(client, user, { ...start, projectId: randomUUID() }),
    (e) => e.status === 403,
  );
  let { timer } = await extensionTimerAction(client, user, start);
  assert.equal(timer.status, "running");
  assert.equal(timer.billable, true);
  assert.equal(timer.hourlyRate, 100);
  assert.equal(timer.taskDetails.trelloCard.url, "https://trello.com/c/AbCd1234");
  await extensionTimerAction(client, user, start); // Idempotent retry.
  await assert.rejects(
    extensionTimerAction(client, user, { ...start, taskId: randomUUID() }),
    (e) => e.status === 409,
  );
  await db.query(
    // Seed against the same application clock used by extensionElapsed; the
    // remote database clock can differ from the Windows/CI runner's clock.
    "update public.active_timers set started_at=$2::timestamptz where workspace_id=$1",
    [ws, new Date(Date.now() - 65_000).toISOString()],
  );
  ({ timer } = await extensionContext(client, user, { workspaceId: ws }));
  const beforePause = timer.version;
  ({ timer } = await extensionTimerAction(client, user, {
    workspaceId: ws,
    action: "pause",
    version: beforePause,
  }));
  assert.equal(timer.status, "paused");
  assert.ok(timer.accumulated >= 65);
  await assert.rejects(
    extensionTimerAction(client, user, { workspaceId: ws, action: "resume", version: beforePause }),
    (e) => e.status === 409,
  );
  ({ timer } = await extensionTimerAction(client, user, {
    workspaceId: ws,
    action: "resume",
    version: timer.version,
  }));
  assert.equal(timer.status, "running");
  assert.equal(
    (
      await extensionTimerAction(client, user, {
        workspaceId: ws,
        action: "stop",
        version: timer.version,
      })
    ).timer,
    null,
  );
  await extensionTimerAction(client, user, {
    workspaceId: ws,
    action: "stop",
    version: timer.version,
  });
  const entries = await db.query("select * from public.time_entries where workspace_id=$1", [ws]);
  assert.equal(entries.rowCount, 1);
  assert.ok(entries.rows[0].duration_seconds >= 65);
  assert.equal(entries.rows[0].task_details.trelloCard.id, "AbCd1234");
  assert.equal(entries.rows[0].billable, true);
  await assert.rejects(extensionTimerAction(client, user, start), (e) => e.status === 409);
  // A shared participant cannot pause/resume/stop, even with a current version.
  await db.query("insert into public.profiles(id,name,email) values($1,'QA Participant',$2)", [
    stranger.id,
    `${stranger.id}@example.test`,
  ]);
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'Member')",
    [ws, stranger.id],
  );
  const sharedId = randomUUID();
  ({ timer } = await extensionTimerAction(client, user, { ...start, taskId: sharedId }));
  await db.query(
    `insert into public.task_invitations(workspace_id,task_id,invited_by,recipient_id,project_id,task,task_details,status)
    values($1,$2,$3,$4,$5,'QA Card',$6,'accepted')`,
    [ws, sharedId, user.id, stranger.id, pid, timer.taskDetails],
  );
  await db.query(
    `insert into public.active_timers(user_id,workspace_id,status,task,project_id,started_at,started_date,start_clock,task_details)
    select $2,workspace_id,status,task,project_id,started_at,started_date,start_clock,task_details
    from public.active_timers where workspace_id=$1 and user_id=$3`,
    [ws, stranger.id, user.id],
  );
  const participant = (await extensionContext(client, stranger, { workspaceId: ws })).timer;
  for (const action of ["pause", "resume", "stop"])
    await assert.rejects(
      extensionTimerAction(client, stranger, {
        workspaceId: ws,
        action,
        version: participant.version,
      }),
      (e) => e.status === 403,
    );
  await db.query("update public.active_timers set accumulated_seconds=65 where workspace_id=$1", [
    ws,
  ]);
  timer = (await extensionContext(client, user, { workspaceId: ws })).timer;
  await extensionTimerAction(client, user, {
    workspaceId: ws,
    action: "stop",
    version: timer.version,
  });
  assert.equal(
    (await db.query("select * from public.active_timers where workspace_id=$1", [ws])).rowCount,
    0,
  );
  assert.equal(
    (
      await db.query("select * from public.time_entries where workspace_id=$1 and user_id=$2", [
        ws,
        stranger.id,
      ])
    ).rowCount,
    1,
  );
  console.log(
    "Extension QA: authorization, billing, start retry, pause/resume CAS, stop atomicity and Trello link passed.",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
