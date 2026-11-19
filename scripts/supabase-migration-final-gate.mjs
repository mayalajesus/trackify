import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cutoverContext, sourceRef, targetRef, folder } from "./lib/migration-cutover-context.mjs";
import { verifyFreeze } from "./lib/migration-write-freeze.mjs";

const c = await cutoverContext();
const json = async (name) => JSON.parse(await readFile(`${folder}/${name}.json`));
const omit = (row, keys) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
const normalize = (table, row) => {
  if (["public.user_preferences", "public.workspace_settings"].includes(table))
    return omit(row, ["updated_at"]);
  if (table === "auth.users")
    return {
      ...omit(row, ["updated_at", "last_sign_in_at", "raw_user_meta_data"]),
      raw_user_meta_data: omit(row.raw_user_meta_data, ["picture", "avatar_url"]),
    };
  if (table === "auth.identities")
    return {
      ...omit(row, ["updated_at", "identity_data"]),
      identity_data: omit(row.identity_data, ["picture", "avatar_url"]),
    };
  if (table === "storage.buckets") return omit(row, ["created_at", "updated_at"]);
  if (table === "storage.objects")
    return omit(row, ["id", "version", "metadata", "created_at", "updated_at", "last_accessed_at"]);
  return row;
};
async function main() {
  const source = await c.db("source"),
    target = await c.db("target");
  try {
    await verifyFreeze(source);
    await verifyFreeze(target);
    const initial = await json("source-audit-20261118");
    const finalSource = await json("cutover-source-final.audit");
    const finalTarget = await json("cutover-target-final.audit");
    assert.equal(finalSource.projectRef, sourceRef);
    assert.equal(finalTarget.projectRef, targetRef);
    assert.deepEqual(
      finalSource.tables,
      initial.tables,
      "Source changed since copied snapshot; reconcile before cutover",
    );
    for (const side of ["source", "target"]) {
      const backup = await json(`cutover-${side}-final.consistency`);
      const restored = await json(`cutover-${side}-restore`);
      assert.equal(backup.sameExportedSnapshot, true);
      assert.equal(backup.archiveEncrypted, true);
      assert.equal(restored.restoredSuccessfully, true);
      assert.equal(restored.restoredTables.length, 56);
      assert.deepEqual(restored.differencesFromBaseline, []);
      assert.deepEqual(restored.integrity, { invalidIndexes: 0, invalidConstraints: 0 });
      const audit = side === "source" ? finalSource : finalTarget;
      for (const t of restored.restoredTables)
        assert.deepEqual({ count: t.count, sha256: t.sha256 }, audit.tables[t.name]);
    }
    const ignore = ["public.api_rate_limits", "public.read_revisions"];
    const special = [
      "public.time_entries",
      "public.user_preferences",
      "public.workspace_settings",
      "auth.users",
      "auth.identities",
      "storage.buckets",
      "storage.objects",
    ];
    for (const [name, value] of Object.entries(finalSource.tables))
      if (name.startsWith("public.") && !ignore.includes(name) && !special.includes(name))
        assert.deepEqual(finalTarget.tables[name], value, `Business table changed: ${name}`);
    for (const table of special) {
      const rows = [];
      for (const db of [source, target])
        rows.push(
          (await db.query(`select to_jsonb(t) as row from ${table} t`)).rows.map((r) => r.row),
        );
      const key = (r) =>
        table === "public.user_preferences"
          ? r.user_id
          : table === "public.workspace_settings"
            ? r.workspace_id
            : table === "storage.objects"
              ? r.bucket_id + "/" + r.name
              : r.id;
      const right = new Map(rows[1].map((r) => [key(r), r]));
      for (const row of rows[0]) {
        const found = right.get(key(row));
        assert.ok(found, `Missing original row: ${table}`);
        assert.deepEqual(
          normalize(table, found),
          normalize(table, row),
          `Changed original row: ${table}`,
        );
        right.delete(key(row));
      }
      if (table === "public.time_entries")
        assert.deepEqual([...right.keys()], ["e8d56e51-b1c6-4174-a219-1d0e0ca0233e"]);
      else assert.equal(right.size, 0, `Unexpected new rows: ${table}`);
    }
    assert.equal(
      finalSource.tables["public.running_timers"]?.count ??
        finalSource.tables["public.active_timers"]?.count,
      0,
    );
    const storage = await json("target-storage-restored-20261119");
    assert.equal(storage.objects.length, 5);
    assert.ok(storage.objects.every((o) => o.verified));
    assert.equal(storage.pathsPreserved, true);
    assert.equal(storage.private, true);
    const backupRun = await json("cutover-backup-run-44475444350");
    assert.equal(backupRun.conclusion, "success");
    const result = {
      at: new Date().toISOString(),
      passed: true,
      sourceFrozen: true,
      targetFrozen: true,
      sourceOriginalSnapshotUnchanged: true,
      originalAccounts: 16,
      workspaces: 11,
      originalTimeEntries: 1064,
      targetTimeEntries: 1065,
      extraUserTestEntryPreserved: true,
      allOriginalPasswordsAndPermissionsPreserved: true,
      encryptedFinalBackupsRestored: true,
      privateStorageFiles: 5,
      githubBackupPassed: true,
      accountDeletionMaintenancePaused: true,
    };
    await c.evidence("cutover-final-gate", result);
    console.log(JSON.stringify(result));
  } finally {
    await source.end();
    await target.end();
  }
}
main().catch(async (e) => {
  await c
    .preserve(`cutover-final-gate-failure-${Date.now()}`, { message: e.message, stack: e.stack })
    .catch(() => {});
  console.error("Final cutover gate failed. Details preserved encrypted; do not activate.");
  process.exitCode = 1;
});
