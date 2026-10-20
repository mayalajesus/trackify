import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { synchronizeAccount } from "../../server/data/account-sync.mjs";
import { loadAccount } from "../../server/data/account.mjs";
import { prepareAccountSync } from "../../shared/account-merge.mjs";
import { createQaClient } from "../support/qa-fixtures.mjs";

const control = createQaClient("concurrency-observer");
const first = createQaClient("concurrency-first");
const second = createQaClient("concurrency-second");
const user = { id: randomUUID(), name: "QA Concurrency", email: `${randomUUID()}@example.test` };
const workspaceId = randomUUID();
const clientId = randomUUID();
const config = { databaseProvider: "neon", initialLanguage: "pt-BR" };
let pendingSecond;
const connected = new Set();

async function verifyConcurrentSaves(conflicting) {
  const baseline = await loadAccount(control, user, config);
  const tabA = structuredClone(baseline),
    tabB = structuredClone(baseline);
  tabA.workspaces[0].clients[0].name = conflicting
    ? "First conflicting edit"
    : "First independent edit";
  if (conflicting) tabB.workspaces[0].clients[0].name = "Second conflicting edit";
  else tabB.workspaces[0].clients[0].contact = "Independent contact";
  const bodyA = prepareAccountSync(baseline, tabA),
    bodyB = prepareAccountSync(baseline, tabB);

  await first.query("begin isolation level serializable");
  await first.query("select id from public.workspaces where id=$1 for update", [workspaceId]);
  const firstPid = (await first.query("select pg_backend_pid() as pid")).rows[0].pid;
  await second.query("begin isolation level serializable");
  const secondPid = (await second.query("select pg_backend_pid() as pid")).rows[0].pid;
  // The second save really runs on another backend while the first holds the
  // workspace lock. Observe PostgreSQL's lock graph, not a guessed delay.
  pendingSecond = (async () => {
    try {
      await synchronizeAccount(second, user, config, bodyB);
      await second.query("commit");
      return { success: true };
    } catch (error) {
      await second.query("rollback");
      return { success: false, error };
    }
  })();
  let blocked = false;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await control.query(
      "select $1::integer = any(pg_blocking_pids($2::integer)) as blocked",
      [firstPid, secondPid],
    );
    if (result.rows[0].blocked) {
      blocked = true;
      break;
    }
    await setTimeout(50);
  }
  assert.equal(blocked, true, "the saves must overlap on two PostgreSQL connections");
  await synchronizeAccount(first, user, config, bodyA);
  await first.query("commit");
  const secondResult = await pendingSecond;
  assert.equal(secondResult.success, false);
  assert.equal(secondResult.error.code, "40001", "the stale transaction must abort safely");
  assert.equal(
    (await control.query("select name from public.clients where id=$1", [clientId])).rows[0].name,
    tabA.workspaces[0].clients[0].name,
  );

  // Retrying with the original baseline must merge independent changes and
  // reject a competing edit to the same field, never overwrite the winner.
  await second.query("begin isolation level serializable");
  if (conflicting) {
    await assert.rejects(synchronizeAccount(second, user, config, bodyB), {
      status: 409,
      code: "sync_conflict",
    });
    await second.query("rollback");
  } else {
    await synchronizeAccount(second, user, config, bodyB);
    await second.query("commit");
  }
  const stored = (
    await control.query("select name,contact from public.clients where id=$1", [clientId])
  ).rows[0];
  assert.equal(stored.name, tabA.workspaces[0].clients[0].name);
  assert.equal(stored.contact, "Independent contact");
}

try {
  const connections = await Promise.allSettled(
    [control, first, second].map(async (client) => {
      await client.connect();
      connected.add(client);
    }),
  );
  if (connections.some((result) => result.status === "rejected"))
    throw new Error("Could not connect the isolated QA concurrency clients.");
  await control.query("begin");
  await control.query("insert into public.profiles(id,name,email) values($1,$2,$3)", [
    user.id,
    user.name,
    user.email,
  ]);
  await control.query(
    "insert into public.workspaces(id,name,owner_id) values($1,'E2E concurrency fixture',$2)",
    [workspaceId, user.id],
  );
  await control.query("insert into public.clients(id,workspace_id,name) values($1,$2,'Original')", [
    clientId,
    workspaceId,
  ]);
  await loadAccount(control, user, config);
  // Separate connections need visible fixtures. Only these random IDs are
  // committed, and cleanup below removes them even when an assertion fails.
  await control.query("commit");
  await verifyConcurrentSaves(false);
  await verifyConcurrentSaves(true);
  console.log(
    "PASS: overlapping PostgreSQL transactions abort stale writes; retry merges independent edits and rejects conflicts.",
  );
} finally {
  if (connected.has(first)) await first.query("rollback").catch(() => undefined);
  await pendingSecond;
  if (connected.has(second)) await second.query("rollback").catch(() => undefined);
  if (connected.has(control)) await control.query("rollback").catch(() => undefined);
  try {
    if (connected.has(control)) {
      await control.query("begin");
      await control.query("delete from public.user_preferences where user_id=$1", [user.id]);
      await control.query("delete from public.workspaces where id=$1 and owner_id=$2", [
        workspaceId,
        user.id,
      ]);
      await control.query("delete from public.profiles where id=$1 and email=$2", [
        user.id,
        user.email,
      ]);
      await control.query("commit");
      assert.equal(
        (await control.query("select 1 from public.profiles where id=$1", [user.id])).rowCount,
        0,
      );
      console.log("Isolated concurrency fixtures removed.");
    }
  } finally {
    await Promise.all([control.end(), first.end(), second.end()]);
  }
}
