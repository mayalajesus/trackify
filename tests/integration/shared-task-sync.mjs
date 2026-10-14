// Run explicitly with node --env-file=.env tests/integration/shared-task-sync.mjs.
// All fixtures are rolled back; this script refuses production databases.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { syncEntries, timeEntryFromRow } from "../../server/data/entries.mjs";
import { clearOwnTimer, syncSharedTimers } from "../../server/data/timer.mjs";

if (process.env.DATABASE_ENV !== "qa") throw Error("QA only");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const owner = randomUUID(),
  member = randomUUID(),
  other = randomUUID();
const ws = randomUUID(),
  clientId = randomUUID(),
  project = randomUUID(),
  task = randomUUID(),
  entryId = randomUUID();
const tx = {
  query: (sql, args) =>
    ["begin", "commit", "rollback"].includes(sql)
      ? Promise.resolve({ rows: [] })
      : db.query(sql, args),
};
try {
  await db.query("begin");
  for (const id of [owner, member, other])
    await db.query("insert into public.profiles(id,name,email) values($1,'QA Shared Sync',$2)", [
      id,
      `${id}@example.com`,
    ]);
  await db.query("insert into public.workspaces(id,name,owner_id) values($1,'QA Shared Sync',$2)", [
    ws,
    owner,
  ]);
  for (const id of [member, other])
    await db.query(
      "insert into public.workspace_members(workspace_id,user_id,role,hourly_rate,currency) values($1,$2,'Member',25,'BRL')",
      [ws, id],
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
    "insert into public.task_invitations(workspace_id,task_id,invited_by,recipient_id,project_id,task,task_details,status) values($1,$2,$3,$4,$5,'Task',$6,'accepted')",
    [ws, task, owner, member, project, { id: task, urgent: false }],
  );
  for (const id of [owner, member, other])
    await db.query(
      "insert into public.active_timers(user_id,workspace_id,status,task,project_id,started_at,started_date,start_clock,task_details,hourly_rate,currency) values($1,$2,'running','Task',$3,now(),current_date,'09:00',$4,25,'BRL')",
      [id, ws, project, { id: id === other ? randomUUID() : task, urgent: false }],
    );
  await db.query(
    "update public.active_timers set task='Updated',status='paused',started_at=null,accumulated_seconds=300 where user_id=$1 and workspace_id=$2",
    [owner, ws],
  );
  await syncSharedTimers(db, owner, ws);
  const timers = (
    await db.query(
      "select user_id,task,status,accumulated_seconds from public.active_timers where workspace_id=$1",
      [ws],
    )
  ).rows;
  assert.equal(timers.find((t) => t.user_id === member).task, "Updated");
  assert.equal(timers.find((t) => t.user_id === member).status, "paused");
  assert.equal(timers.find((t) => t.user_id === member).accumulated_seconds, 300);
  assert.equal(timers.find((t) => t.user_id === other).task, "Task");
  const entry = {
    id: entryId,
    userId: owner,
    date: "2026-10-13",
    start: "09:00",
    end: "09:05",
    seconds: 300,
    projectId: project,
    task: "Task",
    description: "Original",
    taskDetails: { id: task, urgent: false },
    billable: false,
    hourlyRate: 70,
    currency: "BRL",
  };
  await syncEntries(db, owner, ws, [entry]);
  await clearOwnTimer(tx, owner, ws);
  const readCopies = async () =>
    (
      await db.query(
        "select *, date::text,end_date::text,start_time::text,end_time::text from public.time_entries where workspace_id=$1 and user_id=$2",
        [ws, member],
      )
    ).rows;
  const first = (await readCopies())[0];
  assert.equal((await readCopies()).length, 1);
  assert.equal(first.shared_source_entry_id, entryId);
  await syncEntries(db, owner, ws, [
    { ...entry, task: "Renamed", description: "Edited", end: "09:06", seconds: 360 },
  ]);
  const edited = (await readCopies())[0];
  assert.equal(edited.id, first.id);
  assert.equal(edited.description, "Edited");
  assert.equal(edited.task, "Renamed");
  assert.equal(edited.duration_seconds, 360);
  assert.equal(Number(edited.hourly_rate), 25);
  await syncEntries(db, member, ws, [timeEntryFromRow(first)]);
  assert.equal((await readCopies())[0].description, "Edited");
  await syncEntries(db, owner, ws, []);
  assert.equal((await readCopies()).length, 0);
  await syncEntries(db, member, ws, [timeEntryFromRow(first)]);
  assert.equal((await readCopies()).length, 0);
  await syncEntries(db, owner, ws, [entry]);
  assert.equal((await readCopies()).length, 1);
  console.log(
    "PASS: shared timer changes, entry edits, stable replica ids, personal billing, deletion, stale snapshot protection and undo. Fixtures rolled back.",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
