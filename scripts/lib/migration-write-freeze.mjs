import assert from "node:assert/strict";
import { quoteIdentifier as q } from "./supabase-migration-audit.mjs";

export const freezeName = "trackify_cutover_readonly";
const excluded = [
  "auth.schema_migrations",
  "storage.buckets_vectors",
  "storage.migrations",
  "storage.vector_indexes",
];

export async function freezeInventory(db) {
  const tables = (
    await db.query(`select n.nspname as schema,c.relname as name,
    has_table_privilege(current_user,c.oid,'TRIGGER') as permitted
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','storage') and c.relkind='r'
    order by n.nspname,c.relname`)
  ).rows;
  assert.deepEqual(
    tables.filter((t) => !t.permitted).map((t) => `${t.schema}.${t.name}`),
    excluded,
  );
  assert.ok(tables.filter((t) => t.permitted).length >= 52);
  return tables.filter((t) => t.permitted);
}

// DDL locks wait for existing writers before committing the barrier. This is a
// statement trigger so zero-row operations and TRUNCATE cannot bypass it.
export async function freezeWrites(db) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    const tables = await freezeInventory(db);
    await db.query(`create function public.${q(freezeName)}() returns trigger
      language plpgsql set search_path=pg_catalog as $$ begin
      raise exception using errcode='55000',message='Trackify migration: database is temporarily read-only';
      end $$`);
    for (const t of tables) {
      const name = `${q(t.schema)}.${q(t.name)}`;
      await db.query(`create trigger ${q(freezeName)} before insert or update or delete or truncate
        on ${name} for each statement execute function public.${q(freezeName)}()`);
    }
    await db.query("COMMIT");
    return { protectedTables: tables.length, excludedManagedTables: excluded };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function verifyFreeze(db) {
  const tables = await freezeInventory(db);
  const guards = (
    await db.query(
      `select n.nspname as schema,c.relname as name,t.tgenabled as enabled
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where t.tgname=$1 order by n.nspname,c.relname`,
      [freezeName],
    )
  ).rows;
  assert.deepEqual(
    guards,
    tables.map((t) => ({ schema: t.schema, name: t.name, enabled: "O" })),
  );
  for (const name of ["public.time_entries", "auth.users", "storage.objects"]) {
    let code;
    try {
      await db.query(`delete from ${name} where false`);
    } catch (error) {
      code = error.code;
    }
    // Hosted postgres cannot DELETE Storage objects even without our trigger.
    // Its permission denial is also a blocked probe; the inventory above still
    // requires the actual trigger for writes by supabase_storage_admin.
    assert.ok(
      code === "55000" || (name === "storage.objects" && code === "42501"),
      `Write barrier missing on ${name}`,
    );
  }
  return { protectedTables: guards.length, zeroRowProbesBlocked: true };
}

export async function releaseWrites(db) {
  await verifyFreeze(db);
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    // Supabase allows creating a trigger on managed tables but reserves DROP
    // TRIGGER to their owner. We own this temporary function. Remove its exact
    // reviewed trigger dependencies, refusing any other dependent object.
    const expected = await freezeInventory(db);
    const dependencies = (
      await db.query(
        `select d.classid::regclass::text as class,
      t.tgname as trigger,n.nspname as schema,c.relname as name
      from pg_depend d left join pg_trigger t on d.classid='pg_trigger'::regclass and t.oid=d.objid
      left join pg_class c on c.oid=t.tgrelid left join pg_namespace n on n.oid=c.relnamespace
      where d.refclassid='pg_proc'::regclass and d.refobjid=$1::regprocedure
      order by n.nspname,c.relname`,
        [`public.${freezeName}()`],
      )
    ).rows;
    assert.deepEqual(
      dependencies,
      expected.map((t) => ({
        class: "pg_trigger",
        trigger: freezeName,
        schema: t.schema,
        name: t.name,
      })),
    );
    await db.query(`drop function public.${q(freezeName)}() cascade`);
    assert.equal(
      (await db.query("select count(*)::int as n from pg_trigger where tgname=$1", [freezeName]))
        .rows[0].n,
      0,
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
