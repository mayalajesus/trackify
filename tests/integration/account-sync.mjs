// Real PostgreSQL regression checks. Every fixture and write is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadAccount } from "../../server/data/account.mjs";
import { synchronizeAccount } from "../../server/data/account-sync.mjs";
import { prepareAccountSync } from "../../shared/account-merge.mjs";

if (process.env.DATABASE_ENV !== "qa") throw Error("QA only");
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  query_timeout: 20_000,
});
const user = { id: randomUUID(), name: "QA Sync", email: `${randomUUID()}@example.test` };
const workspaceId = randomUUID(),
  clientId = randomUUID();
const config = { databaseProvider: "neon", initialLanguage: "pt-BR" };
async function verifySynchronization() {
  try {
    await db.query("begin isolation level serializable");
    await db.query("insert into public.profiles(id,name,email) values($1,$2,$3)", [
      user.id,
      user.name,
      user.email,
    ]);
    await db.query("insert into public.workspaces(id,name,owner_id) values($1,'QA Sync',$2)", [
      workspaceId,
      user.id,
    ]);
    await db.query("insert into public.clients(id,workspace_id,name) values($1,$2,'Original')", [
      clientId,
      workspaceId,
    ]);
    await db.query(
      `insert into public.time_entries
    (workspace_id,user_id,date,start_time,end_time,end_date,duration_seconds,task,billable)
    select $1,$2,'2026-10-01','09:00','10:00','2026-10-01',3600,'QA history',false
    from generate_series(1,500)`,
      [workspaceId, user.id],
    );
    let entryWrites = 0;
    const trackedClient = {
      query: (sql, args) => {
        if (sql.includes("insert into public.time_entries") && sql.includes("on conflict (id)"))
          entryWrites += 1;
        return db.query(sql, args);
      },
    };
    const baseline = await loadAccount(db, user, config);
    const beforeRead = await db.query(
      `select xmin::text as revision from public.user_preferences where user_id = $1`,
      [user.id],
    );
    const readQueries = [];
    const readOnly = await loadAccount(
      {
        query: (sql, args) => {
          readQueries.push(sql);
          return db.query(sql, args);
        },
      },
      user,
      config,
    );
    assert.deepEqual(readOnly, baseline);
    assert.equal(
      readQueries.every((sql) => sql.trim().startsWith("select")),
      true,
      "loading an initialized account must not acquire write locks",
    );
    assert.deepEqual(
      (
        await db.query(
          `select xmin::text as revision from public.user_preferences where user_id = $1`,
          [user.id],
        )
      ).rows,
      beforeRead.rows,
      "loading must not rewrite preferences",
    );
    const tabA = structuredClone(baseline),
      tabB = structuredClone(baseline);
    tabA.workspaces[0].clients[0].name = "Tab A name";
    const remoteClient = {
      ...tabA.workspaces[0].clients[0],
      id: randomUUID(),
      name: "New remote client",
    };
    tabA.workspaces[0].clients.push(remoteClient);
    await synchronizeAccount(trackedClient, user, config, prepareAccountSync(baseline, tabA));
    tabB.workspaces[0].clients[0].contact = "Tab B contact";
    const saved = await synchronizeAccount(
      trackedClient,
      user,
      config,
      prepareAccountSync(baseline, tabB),
    );
    assert.equal(saved.account.workspaces[0].clients.length, 2);
    const original = saved.account.workspaces[0].clients.find((item) => item.id === clientId);
    assert.equal(original.name, "Tab A name");
    assert.equal(original.contact, "Tab B contact");
    assert.equal(entryWrites, 0, "client edits must not rewrite historical entries");
    const entryTab = structuredClone(baseline);
    entryTab.workspaces[0].entries[0].task = "Changed one entry";
    const entrySave = await synchronizeAccount(trackedClient, user, config, {
      baseAccount: baseline,
      account: entryTab,
    });
    assert.equal(entryWrites, 1, "an entry edit must only upsert the changed entry");
    assert.equal(entrySave.account.workspaces[0].entries.length, 500);

    // Conflicting updates/deletions must abort without changing database records.
    for (const deleting of [false, true]) {
      const stale = structuredClone(baseline);
      if (deleting) stale.workspaces[0].clients = [];
      else stale.workspaces[0].clients[0].name = "Conflicting stale name";
      await db.query("savepoint conflicting_save");
      await assert.rejects(
        synchronizeAccount(db, user, config, { baseAccount: baseline, account: stale }),
        { status: 409, code: "sync_conflict" },
      );
      await db.query("rollback to savepoint conflicting_save");
      assert.equal(
        (await db.query("select name from public.clients where id=$1", [clientId])).rows[0].name,
        "Tab A name",
      );
      await db.query("release savepoint conflicting_save");
    }
    await assert.rejects(synchronizeAccount(db, user, config, { account: tabB }), {
      status: 428,
      code: "sync_baseline_required",
    });
    console.log(
      "PASS: stale snapshots preserve remote records; independent edits merge; conflicting updates/deletions and missing baselines are rejected. Fixtures rolled back.",
    );
  } finally {
    await db.query("rollback");
  }
}

await db.connect();
try {
  // SERIALIZABLE can abort this isolated fixture when other QA sessions are
  // active. Retry the whole rolled-back fixture, never a partial transaction.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await verifySynchronization();
      break;
    } catch (error) {
      if (error.code !== "40001" || attempt === 3) throw error;
    }
  }
} finally {
  await db.end();
}
