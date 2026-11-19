import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectAudit,
  compareAudits,
  fingerprintRows,
  quoteIdentifier,
  validateConnection,
} from "../../scripts/lib/supabase-migration-audit.mjs";

const sourceRef = "aaaaaaaaaaaaaaaaaaaa";
const targetRef = "bbbbbbbbbbbbbbbbbbbb";
const rowA = "a".repeat(64);
const rowB = "b".repeat(64);

function databaseMock({ failData = false, rowCount = 1, hashes = [rowA], readOnly = "on" } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith("select current_setting"))
        return {
          rows: [
            {
              version: "17.6",
              read_only: readOnly,
              isolation: "repeatable read",
              captured_at: "2026-11-18T20:00:00Z",
            },
          ],
        };
      if (sql.includes("c.relkind as kind"))
        return {
          rows: [
            { schema: "public", name: "profiles", kind: "r" },
            { schema: "auth", name: "users", kind: "r" },
          ],
        };
      if (sql.startsWith("select count")) return { rows: [{ count: String(rowCount) }] };
      if (sql.startsWith("select encode")) {
        if (failData) throw new Error("Connection terminated");
        return { rows: hashes.map((hash) => ({ hash })) };
      }
      return { rows: [] };
    },
  };
}

test("database identity rejects a different host, password-only ref, transaction pooler and TLS bypass", () => {
  assert.match(
    validateConnection(
      `postgresql://postgres:secret@db.${sourceRef}.supabase.co/postgres?sslmode=require`,
      sourceRef,
    ),
    /db\.a+\.supabase\.co/,
  );
  assert.ok(
    validateConnection(
      `postgresql://postgres.${sourceRef}:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
      sourceRef,
    ),
  );
  for (const url of [
    `postgresql://postgres:${sourceRef}@db.${targetRef}.supabase.co/postgres`,
    `postgresql://postgres.${sourceRef}:secret@pooler.supabase.com.attacker.test:5432/postgres`,
    `postgresql://postgres.${sourceRef}:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:secret@db.${sourceRef}.supabase.co/postgres?sslmode=disable`,
    `postgresql://postgres:secret@db.${sourceRef}.supabase.co/postgres?ssl=false`,
  ])
    assert.throws(() => validateConnection(url, sourceRef));
});

test("row fingerprints detect changed values and duplicates independently of physical ordering", () => {
  assert.equal(fingerprintRows([rowA, rowB]), fingerprintRows([rowB, rowA]));
  assert.notEqual(fingerprintRows([rowA, rowA]), fingerprintRows([rowA]));
  assert.notEqual(fingerprintRows([rowA]), fingerprintRows([rowB]));
  assert.throws(() => fingerprintRows(["not-a-hash"]));
  assert.equal(
    quoteIdentifier('unsafe";delete from public.profiles;--'),
    '"unsafe"";delete from public.profiles;--"',
  );
});

test("audit requires a read-only snapshot and rolls it back on success", async () => {
  const db = databaseMock();
  const audit = await collectAudit(db, sourceRef);
  assert.equal(db.calls[0], "begin isolation level repeatable read read only");
  assert.ok(db.calls.includes("set local row_security = off"));
  assert.equal(db.calls.at(-1), "rollback");
  assert.equal(audit.tables["public.profiles"].count, 1);
  assert.equal(audit.productionCutoverAuthorized, false);
  assert.ok(db.calls.every((sql) => /^(begin|set local|select|rollback)/i.test(sql)));
});

test("failed/partial reads never produce usable migration evidence", async () => {
  for (const options of [
    { failData: true },
    { rowCount: 2 },
    { readOnly: "off" },
    { rowCount: 200001 },
  ]) {
    const db = databaseMock(options);
    await assert.rejects(collectAudit(db, sourceRef));
    assert.equal(db.calls.at(-1), "rollback");
  }
});

test("backup and audit can share an exported snapshot without accepting arbitrary SQL", async () => {
  const db = databaseMock();
  const snapshot = "00000003-000000A1-1";
  const audit = await collectAudit(db, sourceRef, { snapshot });
  assert.equal(db.calls[1], `SET TRANSACTION SNAPSHOT '${snapshot}'`);
  assert.equal(audit.exportedSnapshot, snapshot);
  const invalid = databaseMock();
  await assert.rejects(collectAudit(invalid, sourceRef, { snapshot: "'; COMMIT; --" }));
  assert.equal(invalid.calls.length, 0);
});

test("matching snapshots do not authorize production and same-project comparisons are refused", async () => {
  const source = await collectAudit(databaseMock(), sourceRef);
  const target = await collectAudit(databaseMock(), targetRef);
  const result = compareAudits(source, target);
  assert.equal(result.databaseParity, "matched");
  assert.equal(result.productionCutoverAuthorized, false);
  assert.throws(() => compareAudits(source, source));
});

test("rollback failure preserves the original diagnostic and still fails closed", async () => {
  const db = databaseMock();
  const original = new Error("Read failed");
  const query = db.query.bind(db);
  db.query = async (sql) => {
    if (sql.startsWith("select encode")) throw original;
    if (sql === "rollback") throw new Error("Connection already closed");
    return query(sql);
  };
  await assert.rejects(collectAudit(db, sourceRef), (error) => {
    assert.equal(error, original);
    assert.equal(error.auditStage, "table-fingerprint:public.profiles");
    return true;
  });
});

test("same row counts cannot hide changed data, missing Auth tables or changed permissions", async () => {
  const source = await collectAudit(databaseMock(), sourceRef);
  const changed = await collectAudit(databaseMock({ hashes: [rowB] }), targetRef);
  assert.equal(compareAudits(source, changed).databaseParity, "different");
  const missing = structuredClone(changed);
  delete missing.tables["auth.users"];
  assert.throws(() => compareAudits(source, missing));
  const missingCatalog = structuredClone(changed);
  delete missingCatalog.catalog.policies;
  assert.throws(() => compareAudits(source, missingCatalog));
  const changedPolicy = structuredClone(source);
  changedPolicy.projectRef = targetRef;
  changedPolicy.catalog.policies.push({ schema: "public", name: "unexpected-public-access" });
  assert.ok(compareAudits(source, changedPolicy).differences.some((d) => d.name === "policies"));
});

test("extra destination tables, sequence drift and version differences are visible", async () => {
  const source = await collectAudit(databaseMock(), sourceRef);
  const target = structuredClone(source);
  target.projectRef = targetRef;
  target.tables["public.unexpected"] = { count: 0, sha256: fingerprintRows([]) };
  target.sequences["auth.refresh_tokens_id_seq"] = { last_value: "42", is_called: true };
  target.serverVersion = "18.0";
  const result = compareAudits(source, target);
  assert.deepEqual(
    result.differences.map((d) => d.section),
    ["tables", "sequences", "server"],
  );
});
