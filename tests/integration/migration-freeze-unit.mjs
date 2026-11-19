import assert from "node:assert/strict";
import { test } from "node:test";
import { freezeWrites, releaseWrites } from "../../scripts/lib/migration-write-freeze.mjs";
import { assertMigrationCandidate } from "../../scripts/lib/migration-project-status.mjs";

test("completed production projects cannot rerun candidate mutations or cutover", () => {
  for (const ref of ["qgqwvyprivwvffuewzmp", "gfedmrhckghmgssgfwis"])
    assert.throws(() => assertMigrationCandidate(ref), /production data/);
});

test("unexpected inaccessible tables abort the whole write barrier", async () => {
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      return { rows: [{ schema: "public", name: "time_entries", permitted: false }] };
    },
  };
  await assert.rejects(freezeWrites(db));
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.ok(!statements.some((sql) => sql.includes("create trigger") || sql === "COMMIT"));
});

test("release refuses an incomplete barrier instead of partially unfreezing", async () => {
  const denied = [
    "auth.schema_migrations",
    "storage.buckets_vectors",
    "storage.migrations",
    "storage.vector_indexes",
  ].map((name) => ({ schema: name.split(".")[0], name: name.split(".")[1], permitted: false }));
  const allowed = Array.from({ length: 52 }, (_, i) => ({
    schema: "public",
    name: `table_${i}`,
    permitted: true,
  }));
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      return { rows: sql.includes("has_table_privilege") ? [...denied, ...allowed] : [] };
    },
  };
  await assert.rejects(releaseWrites(db));
  assert.ok(!statements.some((sql) => sql.startsWith("drop") || sql === "BEGIN"));
});

test("release refuses to cascade into any unexpected dependent object", async () => {
  const denied = [
    "auth.schema_migrations",
    "storage.buckets_vectors",
    "storage.migrations",
    "storage.vector_indexes",
  ].map((name) => ({ schema: name.split(".")[0], name: name.split(".")[1], permitted: false }));
  const allowed = Array.from({ length: 52 }, (_, i) => ({
    schema: "public",
    name: `table_${i}`,
    permitted: true,
  }));
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("has_table_privilege")) return { rows: [...denied, ...allowed] };
      if (sql.startsWith("delete from"))
        throw Object.assign(new Error("blocked"), { code: "55000" });
      if (sql.includes("from pg_trigger"))
        return { rows: allowed.map((t) => ({ schema: t.schema, name: t.name, enabled: "O" })) };
      if (sql.includes("from pg_depend"))
        return { rows: [{ class: "pg_proc", trigger: null, schema: null, name: null }] };
      return { rows: [] };
    },
  };
  await assert.rejects(releaseWrites(db));
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.ok(!statements.some((sql) => sql.startsWith("drop function")));
});
