import assert from "node:assert/strict";
import { test } from "node:test";
import { createReturnPlan, returnPlanSql } from "../../scripts/lib/migration-return-plan.mjs";
const table = {
  schema: "public",
  name: "entries",
  keys: ["id"],
  columns: ["id", "task"],
  baseline: [
    { id: 1, task: "Old" },
    { id: 2, task: "Deleted" },
  ],
  returning: [
    { id: 2, task: "Deleted" },
    { id: 1, task: "Old" },
  ],
  current: [
    { id: 1, task: "Edited" },
    { id: 3, task: "Created" },
  ],
};
test("return includes creations, edits and deletions and never revives missing rows", () => {
  const plan = createReturnPlan([table]);
  assert.deepEqual(plan.summary, { inserts: 1, updates: 1, deletes: 1 });
  assert.equal(plan.productionCutoverAuthorized, false);
  const sql = returnPlanSql(plan);
  assert.match(sql, /SERIALIZABLE/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /IS DISTINCT FROM/);
  assert.doesNotMatch(sql, /CASCADE|TRUNCATE|session_replication_role/);
});
test("changes in the old database block return even with identical row counts", () => {
  assert.throws(
    () =>
      createReturnPlan([
        {
          ...table,
          returning: [
            { id: 1, task: "Other writer" },
            { id: 2, task: "Deleted" },
          ],
        },
      ]),
    /Return conflict/,
  );
});
test("missing keys and duplicate identities fail instead of making a partial plan", () => {
  assert.throws(() => createReturnPlan([{ ...table, keys: [] }]), /primary keys/);
  assert.throws(
    () =>
      createReturnPlan([
        {
          ...table,
          current: [
            { id: 1, task: "A" },
            { id: 1, task: "B" },
          ],
        },
      ]),
    /Ambiguous/,
  );
});
