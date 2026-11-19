import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createStagePlan,
  stagingVerificationSql,
  reviewedTargetFunction,
} from "../../scripts/lib/migration-stage-plan.mjs";

function fixture() {
  const catalog = Object.fromEntries(
    [
      "columns",
      "constraints",
      "indexes",
      "types",
      "relations",
      "functions",
      "schemaPrivileges",
      "defaultPrivileges",
    ].map((name) => [name, []]),
  );
  const table = { count: 1, sha256: "a".repeat(64) };
  const source = {
    projectRef: "a".repeat(20),
    readOnly: true,
    catalog,
    tables: { "public.profiles": table, "auth.users": table, "auth.schema_migrations": table },
  };
  const target = {
    projectRef: "b".repeat(20),
    readOnly: true,
    catalog: structuredClone(catalog),
    tables: { "auth.users": { ...table, count: 0 }, "storage.objects": { ...table, count: 0 } },
  };
  const lines = [
    "1; 1 1 TABLE DATA public profiles postgres",
    "2; 1 2 TABLE DATA auth users supabase_auth_admin",
    "3; 1 3 TABLE DATA auth schema_migrations supabase_auth_admin",
    "4; 1 4 TABLE DATA storage objects supabase_storage_admin",
    "5; 1 5 TABLE DATA vault secrets supabase_admin",
    "6; 1 6 TABLE auth users supabase_auth_admin",
    "7; 1 7 SCHEMA - public pg_database_owner",
    "8; 1 8 SEQUENCE SET auth refresh_tokens_id_seq supabase_auth_admin",
    "9; 1 9 TRIGGER auth users on_auth_user_created supabase_auth_admin",
    "10; 1 10 TRIGGER auth users on_auth_user_email_updated supabase_auth_admin",
    ...["avatar", "workspace_logo"].flatMap((prefix, i) =>
      ["select", "insert", "update", "delete"].map(
        (op, j) =>
          `${20 + i * 4 + j}; 1 1 POLICY storage objects ${prefix}_${op} supabase_storage_admin`,
      ),
    ),
  ];
  return { source, target, toc: lines.join("\n") };
}

test("staging preserves managed schema/ledgers and excludes Storage/Vault rows", () => {
  const { source, target, toc } = fixture();
  const plan = createStagePlan(toc, source, target);
  assert.deepEqual(plan.dataTables, ["auth.users", "public.profiles"]);
  assert.equal(plan.authTriggers, 2);
  assert.equal(plan.storagePolicies, 8);
  assert.ok(
    plan.selected.every(
      (line) =>
        !/TABLE auth|TABLE DATA (storage|vault)|SCHEMA - public|TABLE DATA auth schema_migrations/.test(
          line,
        ),
    ),
  );
  assert.equal(plan.productionCutoverAuthorized, false);
});

test("staging refuses same-project, nonempty target and unreviewed schema drift", () => {
  const { source, target, toc } = fixture();
  assert.throws(() => createStagePlan(toc, source, { ...target, projectRef: source.projectRef }));
  const occupied = structuredClone(target);
  occupied.tables["auth.users"].count = 1;
  assert.throws(() => createStagePlan(toc, source, occupied));
  const existing = structuredClone(target);
  existing.catalog.functions.push({ schema: "public", name: "existing_app" });
  assert.throws(() => createStagePlan(toc, source, existing));
  const drift = structuredClone(target);
  drift.catalog.columns.push({ schema: "auth", name: "changed" });
  assert.throws(() => createStagePlan(toc, source, drift));
});

test("archive omissions, unexpected public data and missing policies abort staging", () => {
  const { source, target, toc } = fixture();
  assert.throws(() => createStagePlan(toc.replace(/^2;.*\n/m, ""), source, target));
  assert.throws(() =>
    createStagePlan(toc + "\n40; 1 1 TABLE DATA public surprise postgres", source, target),
  );
  assert.throws(() => createStagePlan(toc.replace(/^20;.*\n/m, ""), source, target));
});

test("only the exact reviewed target RLS helper is preserved", () => {
  const { source, target, toc } = fixture();
  target.catalog.functions.push(structuredClone(reviewedTargetFunction));
  const plan = createStagePlan(toc, source, target);
  assert.equal(plan.preservedTargetFunctions.length, 1);
  target.catalog.functions[0].definitionSha256 = "f".repeat(64);
  assert.throws(() => createStagePlan(toc, source, target));
});

test("identical schema/default privileges are preserved and drift is refused", () => {
  const { source, target, toc } = fixture();
  const withDefaults =
    toc +
    "\n60; 1 1 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES supabase_admin\n61; 1 1 ACL - SCHEMA public pg_database_owner";
  const plan = createStagePlan(withDefaults, source, target);
  assert.ok(plan.selected.every((line) => !/DEFAULT ACL|ACL - SCHEMA/.test(line)));
  target.catalog.defaultPrivileges.push({
    schema: "public",
    owner: "postgres",
    type: "r",
    acl: "changed",
  });
  assert.throws(() => createStagePlan(withDefaults, source, target));
});

test("Auth rows are loaded in dependency order without disabling managed constraints", () => {
  const { source, target, toc } = fixture();
  source.tables["auth.sessions"] = source.tables["auth.users"];
  source.catalog.constraints.push({ schema: "auth", relation: "sessions", type: "f" });
  target.catalog.constraints = structuredClone(source.catalog.constraints);
  const orderedToc = "50; 1 1 TABLE DATA auth sessions supabase_auth_admin\n" + toc;
  const plan = createStagePlan(orderedToc, source, target, [
    { table: "auth.sessions", references: "auth.users" },
  ]);
  assert.ok(plan.authDataOrder.indexOf("auth.users") < plan.authDataOrder.indexOf("auth.sessions"));
  assert.equal(plan.authConstraintsKeptEnabled, true);
  assert.throws(() => createStagePlan(orderedToc, source, target));
  source.catalog.constraints.push({ schema: "auth", relation: "users", type: "f" });
  target.catalog.constraints = structuredClone(source.catalog.constraints);
  assert.throws(() =>
    createStagePlan(orderedToc, source, target, [
      { table: "auth.sessions", references: "auth.users" },
      { table: "auth.users", references: "auth.sessions" },
    ]),
  );
});

test("transaction verification checks complete data hashes and rejects malformed evidence", () => {
  const { source } = fixture();
  const sql = stagingVerificationSql(source);
  assert.match(sql, /"auth"\."users"/);
  assert.match(sql, /"public"\."profiles"/);
  assert.match(sql, /ORDER BY hash COLLATE "C"/);
  assert.match(sql, /RAISE EXCEPTION/);
  const invalid = structuredClone(source);
  invalid.tables["auth.users"].sha256 = "invalid";
  assert.throws(() => stagingVerificationSql(invalid));
});
