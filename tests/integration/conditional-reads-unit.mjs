import assert from "node:assert/strict";
import { test } from "node:test";
import { conditionalRead } from "../../server/data/conditional-read.mjs";

test("a copied database invalidates old media without losing conditional reads in the same project", async () => {
  const client = { query: async () => ({ rows: [] }) };
  const user = { id: "user" };
  const body = { operation: "loadAccount" };
  const oldConfig = { databaseProvider: "supabase", supabaseUrl: "https://old.supabase.co" };
  const newConfig = { ...oldConfig, supabaseUrl: "https://new.supabase.co" };
  let loads = 0;
  const load = (config) => async () => {
    loads++;
    return { workspaces: [{ workspace: { logoDataUrl: `${config.supabaseUrl}/image` } }] };
  };
  const first = await conditionalRead(client, user, body, load(oldConfig), oldConfig);
  const cached = { ...body, ifRevision: first.revision };
  assert.equal(
    (await conditionalRead(client, user, cached, load(oldConfig), oldConfig)).notModified,
    true,
  );
  assert.equal(loads, 1);
  const migrated = await conditionalRead(client, user, cached, load(newConfig), newConfig);
  assert.equal(migrated.notModified, false);
  assert.equal(migrated.data.workspaces[0].workspace.logoDataUrl, `${newConfig.supabaseUrl}/image`);
  assert.equal(loads, 2);
  assert.equal(
    (
      await conditionalRead(
        client,
        user,
        { ...cached, ifRevision: migrated.revision, supabaseUrl: oldConfig.supabaseUrl },
        load(newConfig),
        { ...newConfig, supabaseServiceRoleKey: "rotated" },
      )
    ).notModified,
    true,
  );
  assert.equal(loads, 2);
});
