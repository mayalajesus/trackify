import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { timerFromRow } from "../../server/data/timer.mjs";
if (process.env.DATABASE_ENV !== "qa") throw Error("QA only");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("begin");
  await db.query(
    readFileSync(
      new URL("../../db/migrations/20261030120000_draft_active_timers.sql", import.meta.url),
      "utf8",
    ),
  );
  const user = randomUUID(),
    workspace = randomUUID();
  await db.query("insert into public.profiles(id,name,email) values($1,'Draft timer QA',$2)", [
    user,
    `${user}@example.test`,
  ]);
  await db.query("insert into public.workspaces(id,name,owner_id) values($1,'Draft timer QA',$2)", [
    workspace,
    user,
  ]);
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'Owner') on conflict do nothing",
    [workspace, user],
  );
  await db.query(
    `insert into public.active_timers(user_id,workspace_id,status,task,project_id,started_at,started_date,start_clock)
    values($1,$2,'running','',null,now(),'2026-10-30','09:00')`,
    [user, workspace],
  );
  await db.query(
    "update public.active_timers set status='paused', started_at=null, accumulated_seconds=95 where user_id=$1",
    [user],
  );
  const result = await db.query(
    "select *,started_date::text,start_clock::text from public.active_timers where user_id=$1",
    [user],
  );
  assert.equal(timerFromRow(result.rows[0]).task, "");
  assert.equal(timerFromRow(result.rows[0]).projectId, null);
  assert.equal(timerFromRow(result.rows[0]).accumulated, 95);
  await db.query("savepoint invalid_entry");
  await assert.rejects(
    db.query(
      `insert into public.time_entries(workspace_id,user_id,date,end_date,start_time,end_time,duration_seconds,task)
    values($1,$2,'2026-10-30','2026-10-30','09:00','09:02',95,'')`,
      [workspace, user],
    ),
    /check constraint/,
  );
  await db.query("rollback to savepoint invalid_entry");
  console.log(
    "QA passed: draft timer persists and reloads; completed entry still rejects empty task.",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
