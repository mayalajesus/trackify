import test from "node:test";
import assert from "node:assert/strict";
import { extensionContext } from "../../server/data/extension.mjs";
const workspaceId = "12345678-1234-4234-8234-123456789abc";
test("recent entries are scoped to the authenticated user and workspace, with bounded pagination", async () => {
  const client = {
    query: async (sql, values) => {
      if (sql.includes("select w.id")) return { rows: [{ id: workspaceId }] };
      if (sql.includes("select w.status"))
        return { rows: [{ status: "active", membership_status: "active", role: "Admin" }] };
      assert.match(sql, /e.workspace_id=\$1 and e.user_id=\$2/);
      assert.match(sql, /limit 21 offset \$3/);
      assert.deepEqual(values, [workspaceId, "self", 20]);
      return { rows: Array.from({ length: 21 }, (_, id) => ({ id: String(id) })) };
    },
  };
  const result = await extensionContext(
    client,
    { id: "self" },
    { workspaceId, recent: true, offset: 20, userId: "someone-else" },
  );
  assert.equal(result.entries.length, 20);
  assert.equal(result.hasMore, true);
  await assert.rejects(
    extensionContext(client, { id: "self" }, { workspaceId, recent: true, offset: -1 }),
    /Página inválida/,
  );
});
test("removed workspace membership cannot read recent entries", async () => {
  let queries = 0;
  const client = {
    query: async () => {
      queries++;
      return { rows: [] };
    },
  };
  await assert.rejects(
    extensionContext(client, { id: "self" }, { workspaceId, recent: true }),
    /access/,
  );
  assert.equal(queries, 2);
});
