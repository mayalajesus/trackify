import assert from "node:assert/strict";
import { quoteIdentifier as ident } from "./supabase-migration-audit.mjs";

export const LOCAL_RESTORE_URL = "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";
export const requiredTriggers = ["on_auth_user_created", "on_auth_user_email_updated"];
export const requiredPolicies = ["avatar", "workspace_logo"].flatMap((prefix) =>
  ["select", "insert", "update", "delete"].map((action) => `${prefix}_${action}`),
);
const tableName = (row) => `${ident(row.schema)}.${ident(row.table)}`;

// Deliberately has no environment fallback: rehearsal writes must never use hosted credentials.
export function assertLocalRestoreUrl(value) {
  assert.equal(value, LOCAL_RESTORE_URL, "Restore requires the fixed disposable local Supabase.");
  return value;
}

export async function readManagedSchema(client) {
  // Stable, qualified deparsing on the source and the restored database.
  await client.query("SET LOCAL search_path = pg_catalog");
  const triggers = (
    await client.query(`
    select n.nspname as schema, c.relname as table, t.tgname as name,
      t.tgenabled as enabled, pg_get_triggerdef(t.oid, false) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where not t.tgisinternal and n.nspname in ('auth','storage') and pn.nspname='public'
    order by n.nspname,c.relname,t.tgname`)
  ).rows;
  const policies = (
    await client.query(`
    select n.nspname as schema, c.relname as table, p.polname as name,
      p.polpermissive as permissive, p.polcmd as command,
      (select json_agg(case when r=0 then 'public' else pg_get_userbyid(r) end
        order by case when r=0 then 'public' else pg_get_userbyid(r) end)
        from unnest(p.polroles) r) as roles,
      pg_get_expr(p.polqual,p.polrelid,false) as using,
      pg_get_expr(p.polwithcheck,p.polrelid,false) as check
    from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('auth','storage') order by n.nspname,c.relname,p.polname`)
  ).rows;
  const tables = (
    await client.query(`
    select n.nspname as schema,c.relname as table,c.relrowsecurity as rls,
      c.relforcerowsecurity as force_rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('auth','storage') and
      (exists(select 1 from pg_policy p where p.polrelid=c.oid) or
       exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
         join pg_namespace pn on pn.oid=p.pronamespace
         where t.tgrelid=c.oid and not t.tgisinternal and pn.nspname='public'))
    order by n.nspname,c.relname`)
  ).rows;
  return { triggers, policies, tables };
}

export function validateManagedSchema(catalog) {
  for (const kind of ["triggers", "policies", "tables"]) {
    assert.ok(Array.isArray(catalog?.[kind]), "Incomplete managed schema inventory.");
    const seen = new Set();
    for (const row of catalog[kind]) {
      assert.ok(["auth", "storage"].includes(row.schema));
      tableName(row);
      const key = JSON.stringify([row.schema, row.table, row.name ?? null]);
      assert.ok(!seen.has(key), "Duplicate inventory member.");
      seen.add(key);
    }
  }
  for (const name of requiredTriggers)
    assert.ok(
      catalog.triggers.some(
        (t) => t.schema === "auth" && t.table === "users" && t.name === name && t.enabled === "O",
      ),
      `Required Auth trigger unavailable: ${name}`,
    );
  for (const name of requiredPolicies)
    assert.ok(
      catalog.policies.some(
        (p) => p.schema === "storage" && p.table === "objects" && p.name === name,
      ),
      `Required Storage policy unavailable: ${name}`,
    );
  assert.ok(
    catalog.tables.some((t) => t.schema === "storage" && t.table === "objects" && t.rls === true),
    "Storage row security must remain enabled.",
  );
  for (const row of [...catalog.triggers, ...catalog.policies])
    assert.ok(catalog.tables.some((t) => t.schema === row.schema && t.table === row.table));
  return catalog;
}

export function managedSchemaSql(catalog) {
  validateManagedSchema(catalog);
  const lines = [
    "-- Supabase managed-schema customizations captured from the backup source.",
    "-- Apply after roles, public schema and data, in the restore transaction.",
  ];
  for (const t of catalog.triggers) {
    const action = { O: "ENABLE", D: "DISABLE", R: "ENABLE REPLICA", A: "ENABLE ALWAYS" }[
      t.enabled
    ];
    assert.ok(
      action &&
        typeof t.definition === "string" &&
        /^CREATE (?:CONSTRAINT )?TRIGGER /.test(t.definition),
    );
    lines.push(
      `DROP TRIGGER IF EXISTS ${ident(t.name)} ON ${tableName(t)};`,
      `${t.definition};`,
      `ALTER TABLE ${tableName(t)} ${action} TRIGGER ${ident(t.name)};`,
    );
  }
  for (const p of catalog.policies) {
    const command = { "*": "ALL", r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" }[p.command];
    assert.ok(
      command && typeof p.permissive === "boolean" && Array.isArray(p.roles) && p.roles.length,
    );
    for (const expr of [p.using, p.check]) assert.ok(expr === null || typeof expr === "string");
    const roles = p.roles.map((r) => (r === "public" ? "PUBLIC" : ident(r))).join(", ");
    lines.push(
      `DROP POLICY IF EXISTS ${ident(p.name)} ON ${tableName(p)};`,
      `CREATE POLICY ${ident(p.name)} ON ${tableName(p)} AS ${p.permissive ? "PERMISSIVE" : "RESTRICTIVE"} FOR ${command} TO ${roles}${p.using === null ? "" : ` USING (${p.using})`}${p.check === null ? "" : ` WITH CHECK (${p.check})`};`,
    );
  }
  for (const t of catalog.tables) {
    assert.equal(typeof t.rls, "boolean");
    assert.equal(typeof t.force_rls, "boolean");
    lines.push(
      `ALTER TABLE ${tableName(t)} ${t.rls ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY;`,
      `ALTER TABLE ${tableName(t)} ${t.force_rls ? "FORCE" : "NO FORCE"} ROW LEVEL SECURITY;`,
    );
  }
  return lines.join("\n") + "\n";
}

export function copyTableCounts(sql) {
  const counts = [];
  let current;
  for (const line of sql.split(/\r?\n/)) {
    if (current) {
      if (line === "\\.") {
        counts.push(current);
        current = undefined;
      } else current.count++;
    } else if (line.startsWith("COPY ")) {
      const m = line.match(/^COPY "?(\w+)"?\."?(\w+)"? \(.+\) FROM stdin;$/);
      assert.ok(m && ["public", "auth", "storage"].includes(m[1]), "Unsupported COPY table.");
      current = { schema: m[1], table: m[2], count: 0 };
    }
  }
  assert.ok(!current, "Truncated COPY data.");
  assert.equal(
    new Set(counts.map((t) => tableName(t))).size,
    counts.length,
    "Duplicate COPY table.",
  );
  for (const name of [
    "auth.users",
    "auth.identities",
    "public.profiles",
    "public.workspaces",
    "public.time_entries",
    "storage.buckets",
    "storage.objects",
  ])
    assert.ok(
      counts.some((t) => `${t.schema}.${t.table}` === name),
      `Missing backup table: ${name}`,
    );
  return counts;
}
