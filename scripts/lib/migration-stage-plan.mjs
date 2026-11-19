import { quoteIdentifier, catalogQueries } from "./supabase-migration-audit.mjs";

const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());

// Reviewed in the otherwise-empty destination: automatically enables RLS on
// future public tables. Preserve it and reject any unreviewed public function.
export const reviewedTargetFunction = {
  schema: "public",
  name: "rls_auto_enable",
  arguments: "",
  security_definer: true,
  owner: "postgres",
  acl: "{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
  definitionSha256: "b21d88816c445d14cef5032c3cd4abaebc1db2001fcb3435022ab6b496182ca4",
};

export function createStagePlan(toc, source, target, authDependencies = []) {
  if (
    !source.readOnly ||
    !target.readOnly ||
    !source.projectRef ||
    !target.projectRef ||
    source.projectRef === target.projectRef ||
    !source.tables?.["public.profiles"] ||
    target.tables?.["auth.users"]?.count !== 0 ||
    target.tables?.["storage.objects"]?.count !== 0
  )
    throw new Error("Valid source and empty, different destination audits are required.");
  if (
    target.catalog.relations.some((row) => row.schema === "public") ||
    target.catalog.functions.some(
      (row) => row.schema === "public" && stable(row) !== stable(reviewedTargetFunction),
    )
  )
    throw new Error("Destination is not empty.");
  for (const section of [
    "columns",
    "constraints",
    "indexes",
    "types",
    "relations",
    "functions",
    "schemaPrivileges",
    "defaultPrivileges",
  ]) {
    const managed = (audit) =>
      audit.catalog[section]
        .filter((row) => ["auth", "storage"].includes(row.schema))
        .map(stable)
        .sort();
    if (JSON.stringify(managed(source)) !== JSON.stringify(managed(target)))
      throw new Error(`Managed ${section} differ; staging refused.`);
  }
  for (const section of ["schemaPrivileges", "defaultPrivileges"]) {
    const publicPrivileges = (audit) =>
      audit.catalog[section]
        .filter((row) => row.schema === "public")
        .map(stable)
        .sort();
    if (JSON.stringify(publicPrivileges(source)) !== JSON.stringify(publicPrivileges(target)))
      throw new Error(`Public ${section} require separate review.`);
  }
  const selected = [];
  const dataTables = [];
  let authTriggers = 0;
  let storagePolicies = 0;
  let sequenceSets = 0;
  for (const line of toc.split(/\r?\n/).filter((line) => /^\d+; /.test(line))) {
    const publicObject =
      /^\d+; \d+ \d+ [A-Z ]+ public /.test(line) && !/ DEFAULT ACL public /.test(line);
    const authData = line.match(/ TABLE DATA auth ([a-z0-9_]+) /);
    const authSequence = / SEQUENCE SET auth refresh_tokens_id_seq /.test(line);
    const authTrigger =
      / TRIGGER auth users (?:on_auth_user_created|on_auth_user_email_updated) /.test(line);
    const storagePolicy =
      / POLICY storage objects (?:avatar|workspace_logo)_(?:insert|select|update|delete) /.test(
        line,
      );
    if (
      publicObject ||
      (authData && authData[1] !== "schema_migrations") ||
      authSequence ||
      authTrigger ||
      storagePolicy
    ) {
      selected.push(line);
      const data = line.match(/ TABLE DATA (public|auth) ([a-z0-9_]+) /);
      if (data) dataTables.push(`${data[1]}.${data[2]}`);
      if (authTrigger) authTriggers++;
      if (storagePolicy) storagePolicies++;
      if (authSequence) sequenceSets++;
    }
  }
  const expected = Object.keys(source.tables)
    .filter((name) => /^(public|auth)\./.test(name) && name !== "auth.schema_migrations")
    .sort();
  if (
    JSON.stringify(dataTables.sort()) !== JSON.stringify(expected) ||
    authTriggers !== 2 ||
    storagePolicies !== 8 ||
    sequenceSets !== 1
  )
    throw new Error("Archive coverage differs from the reviewed staging scope.");
  const authForeignKeys = source.catalog.constraints.filter(
    (row) => row.schema === "auth" && row.type === "f",
  );
  if (authDependencies.length !== authForeignKeys.length)
    throw new Error("Auth dependency inventory is incomplete.");
  const authEntries = new Map(
    selected.flatMap((line) => {
      const match = line.match(/ TABLE DATA auth ([a-z0-9_]+) /);
      return match ? [[`auth.${match[1]}`, line]] : [];
    }),
  );
  const waiting = new Map([...authEntries.keys()].map((name) => [name, new Set()]));
  for (const dependency of authDependencies) {
    if (!waiting.has(dependency.table) || !waiting.has(dependency.references))
      throw new Error("Unreviewed Auth table dependency.");
    if (dependency.table !== dependency.references)
      waiting.get(dependency.table).add(dependency.references);
  }
  const ordered = [];
  while (waiting.size) {
    const ready = [...waiting]
      .filter(([, parents]) => parents.size === 0)
      .map(([name]) => name)
      .sort();
    if (!ready.length)
      throw new Error("Cyclic Auth dependencies need a separate restore strategy.");
    for (const name of ready) {
      ordered.push(name);
      waiting.delete(name);
      for (const parents of waiting.values()) parents.delete(name);
    }
  }
  let position = 0;
  const orderedSelection = selected.map((line) =>
    / TABLE DATA auth /.test(line) ? authEntries.get(ordered[position++]) : line,
  );
  return {
    sourceRef: source.projectRef,
    targetRef: target.projectRef,
    selected: orderedSelection,
    dataTables,
    authDataOrder: ordered,
    authConstraintsKeptEnabled: true,
    authTriggers,
    storagePolicies,
    sequenceSets,
    preservedTargetFunctions: target.catalog.functions.filter((row) => row.schema === "public"),
    excluded: [
      "managed schema definitions",
      "managed migration ledgers",
      "Vault",
      "Storage bucket/object rows (uploaded separately)",
      "provider role passwords",
      "existing identical public schema/default privileges",
    ],
    productionCutoverAuthorized: false,
  };
}

// pg_restore ACL entries assume freshly created objects have PostgreSQL's
// built-in defaults. Supabase adds grants to anon/authenticated automatically.
// Remove those grants only where the reviewed source explicitly excludes them.
export function stagingPrivilegesSql(source) {
  const statements = [];
  for (const row of source.catalog.relations.filter((item) => item.schema === "public")) {
    if (row.acl === "{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}")
      statements.push(
        `REVOKE ALL ON TABLE public.${quoteIdentifier(row.name)} FROM anon, authenticated;`,
      );
  }
  for (const row of source.catalog.functions.filter((item) => item.schema === "public")) {
    if (row.acl !== "{postgres=X/postgres,service_role=X/postgres}") continue;
    const signatures = { bump_read_revision: "text, text, text", track_read_revision: "" };
    if (!Object.hasOwn(signatures, row.name)) throw new Error("Unreviewed restricted function.");
    statements.push(
      `REVOKE ALL ON FUNCTION public.${quoteIdentifier(row.name)}(${signatures[row.name]}) FROM anon, authenticated;`,
    );
  }
  return statements.join("\n");
}

export function stagingVerificationSql(source) {
  const checks = Object.entries(source.tables)
    .filter(([name]) => /^(public|auth)\./.test(name))
    .map(([name, expected]) => {
      if (
        !/^[a-f0-9]{64}$/.test(expected.sha256) ||
        !Number.isSafeInteger(expected.count) ||
        expected.count < 0
      )
        throw new Error("Invalid expected data fingerprint.");
      const qualified = name.split(".").map(quoteIdentifier).join(".");
      return `IF (SELECT count(*) FROM ONLY ${qualified}) <> ${expected.count} OR (SELECT encode(sha256(convert_to(coalesce(string_agg(hash,E'\\n' ORDER BY hash COLLATE "C"),''),'UTF8')),'hex') FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash FROM ONLY ${qualified} t) r) <> ${literal(expected.sha256)} THEN RAISE EXCEPTION 'Migration data verification failed: %', ${literal(name)}; END IF;`;
    });
  const privilegeChecks = ["schemaPrivileges", "defaultPrivileges"].map((section) => {
    const expected = source.catalog[section].filter((row) => row.schema === "public");
    const query = catalogQueries[section].replaceAll("$1", "ARRAY['public']::text[]");
    const order = section === "defaultPrivileges" ? "r.owner,r.type" : "r.owner";
    return `IF (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY ${order}),'[]'::jsonb) FROM (${query}) r WHERE r.schema='public') <> ${literal(JSON.stringify(expected))}::jsonb THEN RAISE EXCEPTION 'Migration privilege verification failed'; END IF;`;
  });
  for (const row of source.catalog.relations.filter((item) => item.schema === "public"))
    privilegeChecks.push(
      `IF (SELECT coalesce(c.relacl::text,'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=${literal(row.name)}) IS DISTINCT FROM ${literal(row.acl)} THEN RAISE EXCEPTION 'Table privilege mismatch'; END IF;`,
    );
  for (const row of source.catalog.functions.filter((item) => item.schema === "public"))
    privilegeChecks.push(
      `IF (SELECT coalesce(p.proacl::text,'') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=${literal(row.name)} AND pg_get_function_identity_arguments(p.oid)=${literal(row.arguments)}) IS DISTINCT FROM ${literal(row.acl)} THEN RAISE EXCEPTION 'Function privilege mismatch'; END IF;`,
    );
  return `SET LOCAL timezone='UTC';SET LOCAL datestyle='ISO, YMD';SET LOCAL intervalstyle='iso_8601';SET LOCAL extra_float_digits=3;\nDO $verify$ BEGIN\n${checks.join("\n")}\n${privilegeChecks.join("\n")}\nIF EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public' AND NOT k.convalidated) OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (NOT i.indisvalid OR NOT i.indisready)) THEN RAISE EXCEPTION 'Migration integrity verification failed'; END IF; END $verify$;`;
}
