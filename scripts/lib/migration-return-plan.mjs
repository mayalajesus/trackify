import { createHash } from "node:crypto";
import { quoteIdentifier } from "./supabase-migration-audit.mjs";

const canonical = (value) =>
  JSON.stringify(
    value && typeof value === "object"
      ? Array.isArray(value)
        ? value.map((v) => JSON.parse(canonical(v)))
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, JSON.parse(canonical(value[k]))]),
          )
      : value,
  );
const equal = (a, b) => canonical(a) === canonical(b);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

// No network, credentials or write executor. A return is refused if the previous
// database changed after the baseline, even when the row counts still match.
export function createReturnPlan(tables) {
  const changes = [];
  for (const table of tables) {
    if (
      !table.keys?.length ||
      !table.columns?.length ||
      table.keys.some((k) => !table.columns.includes(k))
    )
      throw Error("Reviewed primary keys and writable columns required");
    const index = (rows) => {
      const out = new Map();
      for (const row of rows) {
        const key = canonical(table.keys.map((k) => row[k]));
        if (table.keys.some((k) => row[k] == null) || out.has(key))
          throw Error("Ambiguous row identity");
        out.set(key, row);
      }
      return out;
    };
    const baseline = index(table.baseline),
      current = index(table.current),
      returning = index(table.returning);
    for (const key of new Set([...baseline.keys(), ...returning.keys()]))
      if (!equal(baseline.get(key) ?? null, returning.get(key) ?? null))
        throw Error(`Return conflict in ${table.schema}.${table.name}`);
    for (const key of new Set([...baseline.keys(), ...current.keys()])) {
      const before = baseline.get(key) ?? null,
        after = current.get(key) ?? null;
      if (!equal(before, after))
        changes.push({
          table,
          kind: !before ? "insert" : !after ? "delete" : "update",
          before,
          after,
        });
    }
  }
  return {
    tables,
    changes,
    summary: {
      inserts: changes.filter((x) => x.kind === "insert").length,
      updates: changes.filter((x) => x.kind === "update").length,
      deletes: changes.filter((x) => x.kind === "delete").length,
    },
    productionCutoverAuthorized: false,
  };
}

// Tables must arrive in reviewed parent-before-child order. Inserts precede
// updates; deletes use reverse order. SQL failure rolls back the entire batch.
// No CASCADE, TRUNCATE, replica mode, disabled constraint or source fallback.
export function returnPlanSql(plan) {
  const guards = plan.tables.map((table) => {
    const qualified = [table.schema, table.name].map(quoteIdentifier).join(".");
    const expected = `SELECT value FROM jsonb_array_elements(${literal(JSON.stringify(table.baseline))}::jsonb)`;
    const actual = `SELECT to_jsonb(t) FROM ${qualified} t`;
    const body = `BEGIN IF EXISTS ((${actual} EXCEPT ALL ${expected}) UNION ALL (${expected} EXCEPT ALL ${actual})) THEN RAISE EXCEPTION 'Return baseline changed'; END IF; END`;
    return `LOCK TABLE ${qualified} IN SHARE ROW EXCLUSIVE MODE;DO ${literal(body)};`;
  });
  const selected = [
    ...plan.changes.filter((x) => x.kind === "insert"),
    ...plan.changes.filter((x) => x.kind === "update"),
    ...plan.changes.filter((x) => x.kind === "delete").reverse(),
  ];
  const commands = selected.map(({ table, kind, before, after }) => {
    const qualified = [table.schema, table.name].map(quoteIdentifier).join(".");
    const row = after ?? before;
    const key = table.keys
      .map((k) => `to_jsonb(t)->${literal(k)}=${literal(JSON.stringify(row[k]))}::jsonb`)
      .join(" AND ");
    const read = `SELECT to_jsonb(t) INTO existing FROM ${qualified} t WHERE ${key} FOR UPDATE;`;
    const guard = before
      ? `IF existing IS DISTINCT FROM ${literal(JSON.stringify(before))}::jsonb THEN RAISE EXCEPTION 'Return concurrent change'; END IF;`
      : `IF existing IS NOT NULL THEN RAISE EXCEPTION 'Return concurrent insert'; END IF;`;
    let command;
    if (kind === "delete") command = `DELETE FROM ${qualified} t WHERE ${key};`;
    else {
      const record = `jsonb_populate_record(NULL::${qualified},${literal(JSON.stringify(after))}::jsonb)`;
      if (kind === "insert")
        command = `INSERT INTO ${qualified} (${table.columns.map(quoteIdentifier).join(",")}) SELECT ${table.columns.map((c) => `r.${quoteIdentifier(c)}`).join(",")} FROM ${record} r;`;
      else
        command = `UPDATE ${qualified} t SET ${table.columns
          .filter((c) => !table.keys.includes(c))
          .map((c) => `${quoteIdentifier(c)}=r.${quoteIdentifier(c)}`)
          .join(",")} FROM ${record} r WHERE ${key};`;
    }
    const body = `DECLARE existing jsonb; affected bigint; BEGIN ${read}${guard}${command} GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'Return row count mismatch'; END IF; END`;
    return `DO ${literal(body)};`;
  });
  return `BEGIN ISOLATION LEVEL SERIALIZABLE;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';SET LOCAL timezone='UTC';\n${guards.join("\n")}\n${commands.join("\n")}\nCOMMIT;`;
}

export function returnPlanDigest(plan) {
  return createHash("sha256").update(returnPlanSql(plan)).digest("hex");
}
