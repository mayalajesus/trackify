import { createHash } from "node:crypto";

export const AUDIT_FORMAT = 1;
const schemas = ["public", "auth", "storage", "vault"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function quoteIdentifier(value) {
  if (typeof value !== "string" || !value || value.includes("\0")) {
    throw new Error("Invalid database identifier.");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

// A project reference in a query parameter or password is not proof of identity.
// Accept only Supabase direct hosts or its session pooler with the exact role suffix.
export function validateConnection(connectionString, projectRef) {
  if (!/^[a-z]{20}$/.test(projectRef ?? "")) throw new Error("Invalid project reference.");
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("A PostgreSQL connection URL is required.");
  }
  const direct = url.hostname === `db.${projectRef}.supabase.co`;
  const pooler =
    /(?:^|\.)pooler\.supabase\.com$/.test(url.hostname) &&
    decodeURIComponent(url.username) === `postgres.${projectRef}`;
  if (!["postgres:", "postgresql:"].includes(url.protocol) || (!direct && !pooler)) {
    throw new Error("Connection does not identify the expected Supabase project.");
  }
  if (url.port && url.port !== "5432") {
    throw new Error("Use the direct connection or session pooler on port 5432.");
  }
  if (
    [...url.searchParams.keys()].some((key) => !["sslmode", "channel_binding"].includes(key)) ||
    url.searchParams.get("sslmode") === "disable" ||
    url.searchParams.get("sslmode") === "no-verify"
  ) {
    throw new Error("Unsupported connection options; TLS verification is required.");
  }
  // node-postgres URL SSL parameters otherwise override its explicit ssl object.
  url.searchParams.delete("sslmode");
  return url.toString();
}

export function fingerprintRows(hashes) {
  if (!hashes.every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error("Invalid row fingerprint returned by PostgreSQL.");
  }
  // Preserve duplicates; do not use a Set. Physical row order must not affect parity.
  return sha256([...hashes].sort().join("\n"));
}

export const catalogQueries = {
  schemaPrivileges: `select nspname as schema,pg_get_userbyid(nspowner) as owner,
    coalesce(nspacl::text,'') as acl from pg_namespace where nspname=any($1) order by nspname`,
  defaultPrivileges: `select n.nspname as schema,r.rolname as owner,d.defaclobjtype as type,
    d.defaclacl::text as acl from pg_default_acl d join pg_roles r on r.oid=d.defaclrole
    left join pg_namespace n on n.oid=d.defaclnamespace
    where n.nspname=any($1) or d.defaclnamespace=0 order by n.nspname,r.rolname,d.defaclobjtype`,
  relations: `select n.nspname as schema, c.relname as name, c.relkind as kind,
    c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
    pg_get_userbyid(c.relowner) as owner, c.relreplident as replica_identity,
    coalesce(c.relacl::text, '') as acl,
    case when c.relkind in ('v','m') then pg_get_viewdef(c.oid, true) else '' end as definition
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=any($1) and c.relkind in ('r','p','v','m','S','f')
    order by n.nspname,c.relname`,
  columns: `select n.nspname as schema,c.relname as relation,a.attname as name,
    a.attnum as position,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,
    a.attidentity as identity,a.attgenerated as generated,coalesce(a.attacl::text,'') as acl,
    coalesce(pg_get_expr(d.adbin,d.adrelid),'') as definition,
    case when a.attcollation=0 then '' else a.attcollation::regcollation::text end as collation
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where n.nspname=any($1) and c.relkind in ('r','p','v','m','f')
      and a.attnum>0 and not a.attisdropped order by n.nspname,c.relname,a.attnum`,
  constraints: `select n.nspname as schema,c.relname as relation,k.conname as name,
    k.contype as type,k.convalidated as validated,pg_get_constraintdef(k.oid,true) as definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1)
    order by n.nspname,c.relname,k.conname`,
  indexes: `select n.nspname as schema,c.relname as relation,ic.relname as name,
    i.indisvalid as valid,i.indisready as ready,pg_get_indexdef(i.indexrelid) as definition
    from pg_index i join pg_class c on c.oid=i.indrelid
    join pg_class ic on ic.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=any($1) order by n.nspname,c.relname,ic.relname`,
  policies: `select schemaname as schema,tablename as relation,policyname as name,
    permissive,roles::text,cmd,coalesce(qual,'')||' CHECK '||coalesce(with_check,'') as definition
    from pg_policies where schemaname=any($1) order by schemaname,tablename,policyname`,
  triggers: `select n.nspname as schema,c.relname as relation,t.tgname as name,
    t.tgenabled as enabled,pg_get_triggerdef(t.oid,true) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname=any($1) order by n.nspname,c.relname,t.tgname`,
  functions: `select n.nspname as schema,p.proname as name,
    pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef as security_definer,
    pg_get_userbyid(p.proowner) as owner,coalesce(p.proacl::text,'') as acl,
    pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname=any($1) and p.prokind in ('f','p')
    order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`,
  types: `select n.nspname as schema,t.typname as name,t.typtype as kind,
    t.typbasetype::regtype::text as base_type,t.typnotnull as not_null,
    coalesce(t.typdefault,'') as definition,
    coalesce((select json_agg(e.enumlabel order by e.enumsortorder)::text
      from pg_enum e where e.enumtypid=t.oid),'[]') as enum_values
    from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname=any($1) and t.typtype in ('e','d') order by n.nspname,t.typname`,
  sequences: `select schemaname as schema,sequencename as name,data_type::text,
    start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text
    from pg_sequences where schemaname=any($1) order by schemaname,sequencename`,
  publications: `select pubname as name,puballtables,pubinsert,pubupdate,pubdelete,pubtruncate
    from pg_publication order by pubname`,
  publicationTables: `select pubname as publication,schemaname as schema,tablename as name
    from pg_publication_tables where schemaname=any($1) order by pubname,schemaname,tablename`,
  extensions: `select e.extname as name,e.extversion as version,n.nspname as schema
    from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname`,
};

function sanitizeCatalog(rows) {
  return rows.map(({ definition, ...row }) => ({
    ...row,
    ...(definition === undefined ? {} : { definitionSha256: sha256(definition) }),
  }));
}

export async function collectAudit(client, projectRef, { maxRows = 200_000, snapshot } = {}) {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) throw new Error("Invalid row limit.");
  if (snapshot !== undefined && !/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/i.test(snapshot))
    throw new Error("Invalid PostgreSQL exported snapshot.");
  await client.query("begin isolation level repeatable read read only");
  let stage = "snapshot-settings";
  let failure;
  let audit;
  try {
    if (snapshot) await client.query(`SET TRANSACTION SNAPSHOT '${snapshot}'`);
    await client.query("set local statement_timeout = '30s'");
    await client.query("set local lock_timeout = '3s'");
    await client.query("set local row_security = off");
    await client.query("set local timezone = 'UTC'");
    await client.query("set local datestyle = 'ISO, YMD'");
    await client.query("set local intervalstyle = 'iso_8601'");
    await client.query("set local extra_float_digits = 3");
    stage = "snapshot-metadata";
    const metadata = (
      await client.query(`select current_setting('server_version') as version,
      current_setting('transaction_read_only') as read_only,
      current_setting('transaction_isolation') as isolation,
      transaction_timestamp() as captured_at`)
    ).rows[0];
    if (metadata?.read_only !== "on" || metadata?.isolation !== "repeatable read") {
      throw new Error("The audit requires a read-only repeatable-read snapshot.");
    }
    const catalog = {};
    for (const [name, sql] of Object.entries(catalogQueries)) {
      stage = `catalog:${name}`;
      catalog[name] = sanitizeCatalog(
        (await client.query(sql, sql.includes("$1") ? [schemas] : [])).rows,
      );
    }
    if (catalog.relations.some((relation) => ["p", "f", "m"].includes(relation.kind))) {
      throw new Error(
        "Partitioned/foreign tables or materialized views require a reviewed audit strategy.",
      );
    }
    const tables = {};
    for (const relation of catalog.relations.filter((r) => r.kind === "r")) {
      const qualified = `${quoteIdentifier(relation.schema)}.${quoteIdentifier(relation.name)}`;
      stage = `table-count:${relation.schema}.${relation.name}`;
      const count = Number(
        (await client.query(`select count(*)::text as count from only ${qualified}`)).rows[0].count,
      );
      if (!Number.isSafeInteger(count) || count > maxRows) {
        throw new Error("Table exceeds the audit row limit; no partial comparison is allowed.");
      }
      if (count === 0) {
        tables[`${relation.schema}.${relation.name}`] = { count: 0, sha256: fingerprintRows([]) };
        continue;
      }
      stage = `table-fingerprint:${relation.schema}.${relation.name}`;
      const rows = (
        await client.query(
          `select encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') as hash
        from only ${qualified} t limit $1`,
          [maxRows + 1],
        )
      ).rows;
      if (rows.length !== count) throw new Error("Incomplete table fingerprint.");
      tables[`${relation.schema}.${relation.name}`] = {
        count,
        sha256: fingerprintRows(rows.map((row) => row.hash)),
      };
    }
    const sequences = {};
    for (const sequence of catalog.sequences) {
      stage = `sequence:${sequence.schema}.${sequence.name}`;
      const qualified = `${quoteIdentifier(sequence.schema)}.${quoteIdentifier(sequence.name)}`;
      sequences[`${sequence.schema}.${sequence.name}`] = (
        await client.query(`select last_value::text,is_called from ${qualified}`)
      ).rows[0];
    }
    audit = {
      format: AUDIT_FORMAT,
      projectRef,
      capturedAt: metadata.captured_at,
      serverVersion: metadata.version,
      readOnly: true,
      ...(snapshot ? { exportedSnapshot: snapshot } : {}),
      catalog,
      tables,
      sequences,
      productionCutoverAuthorized: false,
      limitations: [
        "Fingerprints prove equality only at the captured database snapshots.",
        "Independent databases and sequences do not share an atomic snapshot; final comparison requires a verified write freeze.",
        "Storage object bytes, service settings, Google login, runtime authorization and rollback require separate validation.",
        "This report is not a database backup or permission to switch production.",
      ],
    };
  } catch (error) {
    failure = error;
    error.auditStage = stage;
  } finally {
    try {
      await client.query("rollback");
    } catch (error) {
      // A broken connection may reject rollback too. Preserve the original failure.
      if (!failure) {
        error.auditStage = "rollback";
        failure = error;
      }
    }
  }
  if (failure) throw failure;
  return audit;
}

function validateAudit(audit) {
  if (
    audit?.format !== AUDIT_FORMAT ||
    audit.readOnly !== true ||
    !audit.projectRef ||
    !audit.tables ||
    !audit.catalog ||
    !audit.sequences ||
    !audit.tables["public.profiles"] ||
    !audit.tables["auth.users"]
  ) {
    throw new Error("Incomplete Trackify audit; comparison refused.");
  }
  for (const name of Object.keys(catalogQueries)) {
    if (!Array.isArray(audit.catalog[name])) throw new Error("Missing catalog section.");
  }
  for (const table of Object.values(audit.tables)) {
    if (
      !Number.isSafeInteger(table.count) ||
      table.count < 0 ||
      !/^[a-f0-9]{64}$/.test(table.sha256 ?? "")
    )
      throw new Error("Invalid table evidence.");
  }
}

export function compareAudits(source, target) {
  validateAudit(source);
  validateAudit(target);
  if (source.projectRef === target.projectRef)
    throw new Error("Source and destination must differ.");
  const differences = [];
  const compare = (section, left, right) => {
    for (const name of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (JSON.stringify(left[name]) !== JSON.stringify(right[name]))
        differences.push({ section, name });
    }
  };
  compare("tables", source.tables, target.tables);
  compare("catalog", source.catalog, target.catalog);
  compare("sequences", source.sequences, target.sequences);
  if (source.serverVersion !== target.serverVersion)
    differences.push({ section: "server", name: "version" });
  return {
    sourceRef: source.projectRef,
    targetRef: target.projectRef,
    sourceCapturedAt: source.capturedAt,
    targetCapturedAt: target.capturedAt,
    databaseParity: differences.length === 0 ? "matched" : "different",
    differences,
    productionCutoverAuthorized: false,
    note: "Managed-schema/version differences require review; matching databases alone do not authorize production cutover.",
  };
}
