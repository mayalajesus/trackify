import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_RESTORE_URL,
  assertLocalRestoreUrl,
  requiredTriggers,
  requiredPolicies,
  managedSchemaSql,
  copyTableCounts,
} from "../../scripts/lib/backup-managed-schema.mjs";

function fixture() {
  return {
    triggers: requiredTriggers.map((name) => ({
      schema: "auth",
      table: "users",
      name,
      enabled: "O",
      definition: `CREATE TRIGGER ${name} AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`,
    })),
    policies: requiredPolicies.map((name) => ({
      schema: "storage",
      table: "objects",
      name,
      permissive: true,
      command: "*",
      roles: ["public"],
      using: "true",
      check: null,
    })),
    tables: [
      { schema: "auth", table: "users", rls: true, force_rls: false },
      { schema: "storage", table: "objects", rls: true, force_rls: false },
    ],
  };
}

test("restore rejects hosted URLs and every override of the disposable local database", () => {
  assert.equal(assertLocalRestoreUrl(LOCAL_RESTORE_URL), LOCAL_RESTORE_URL);
  for (const url of [
    undefined,
    "postgresql://postgres:secret@db.gfedmrhckghmgssgfwis.supabase.co/postgres",
    "postgresql://postgres@localhost:5432/postgres",
    LOCAL_RESTORE_URL + "?host=db.example.com",
    LOCAL_RESTORE_URL.replace("127.0.0.1", "127.0.0.1.example.com"),
    LOCAL_RESTORE_URL.replace("54322", "5432"),
  ])
    assert.throws(() => assertLocalRestoreUrl(url));
});

test("managed schema preserves policy semantics, quoting, trigger state and forced RLS", () => {
  const catalog = fixture();
  catalog.policies.push({
    schema: "storage",
    table: "objects",
    name: 'restricted "name',
    permissive: false,
    command: "w",
    roles: ["authenticated", 'role"name'],
    using: "(bucket_id = 'avatars'::text)",
    check: "(name <> ''::text)",
  });
  catalog.triggers.push({
    schema: "auth",
    table: "users",
    name: "extra_disabled",
    enabled: "D",
    definition:
      "CREATE TRIGGER extra_disabled AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()",
  });
  catalog.tables[1].force_rls = true;
  const sql = managedSchemaSql(catalog);
  assert.match(
    sql,
    /AS RESTRICTIVE FOR UPDATE TO "authenticated", "role""name" USING \(\(bucket_id = 'avatars'::text\)\) WITH CHECK \(\(name <> ''::text\)\)/,
  );
  assert.match(sql, /DISABLE TRIGGER "extra_disabled"/);
  assert.match(sql, /"storage"\."objects" FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /"restricted ""name"/);
  assert.match(sql, /FOR ALL TO PUBLIC USING/);
});

test("omissions, disabled required triggers, duplicates and disabled image RLS fail closed", () => {
  const changes = [
    (c) => c.triggers.pop(),
    (c) => c.policies.pop(),
    (c) => {
      c.triggers[0].enabled = "D";
    },
    (c) => {
      c.tables[1].rls = false;
    },
    (c) => c.policies.push(c.policies[0]),
    (c) => {
      c.policies[0].command = "DROP";
    },
    (c) => {
      c.policies[0].roles = [];
    },
    (c) => {
      c.tables.pop();
    },
  ];
  for (const change of changes) {
    const c = fixture();
    change(c);
    assert.throws(() => managedSchemaSql(c));
  }
});

test("COPY coverage includes Auth and Storage, escaped newlines, empty tables and truncation checks", () => {
  const names = [
    "auth.users",
    "auth.identities",
    "public.profiles",
    "public.workspaces",
    "public.time_entries",
    "storage.buckets",
    "storage.objects",
  ];
  const sql = names
    .map(
      (name, i) =>
        `COPY ${name} (id, name) FROM stdin;\n${i === 4 ? "1\ttext\\nwith newline\n2\tother\n" : ""}\\.\n`,
    )
    .join("\n");
  assert.equal(copyTableCounts(sql).find((t) => t.table === "time_entries").count, 2);
  assert.equal(copyTableCounts(sql)[0].count, 0);
  assert.throws(() => copyTableCounts(sql.replace("COPY auth.users", "COPY auth.omitted")));
  assert.throws(() => copyTableCounts(sql.slice(0, -3)));
  assert.throws(() => copyTableCounts(sql + "COPY auth.users (id) FROM stdin;\n\\.\n"));
});
