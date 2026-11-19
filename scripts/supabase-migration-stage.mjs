import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openArchive } from "./lib/migration-archive.mjs";
import {
  createStagePlan,
  stagingVerificationSql,
  stagingPrivilegesSql,
  reviewedTargetFunction,
} from "./lib/migration-stage-plan.mjs";
import { runDirectPsql, POSTGRES_IMAGE } from "./lib/migration-postgres.mjs";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";
import { assertMigrationCandidate } from "./lib/migration-project-status.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}
let phase = "load-input";
function decode(archive, args) {
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      "--read-only",
      "--network",
      "none",
      "--cap-drop=ALL",
      "--tmpfs",
      "/restore:rw,nosuid,noexec,size=128m",
      ...(args.mounts ?? []),
      POSTGRES_IMAGE,
      "sh",
      "-c",
      'umask 077; cat > /restore/input.dump && exec pg_restore "$@" /restore/input.dump',
      "pg_restore",
      ...args.command,
    ],
    { input: archive, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw Object.assign(new Error("Offline archive decoding failed."), {
      code: "OFFLINE_ARCHIVE_FAILED",
    });
  return result.stdout;
}
async function main() {
  assertMigrationCandidate(arg("target-ref"));
  const source = JSON.parse(await readFile(arg("source-audit"), "utf8"));
  const target = JSON.parse(await readFile(arg("target-audit"), "utf8"));
  const dependencies = JSON.parse(await readFile(arg("auth-dependencies"), "utf8"));
  if (target.projectRef !== arg("target-ref") || source.projectRef === target.projectRef)
    throw new Error("Destination identity differs from the reviewed plan.");
  if (
    dependencies.projectRef !== target.projectRef ||
    !dependencies.canCreateAuthTrigger ||
    dependencies.missingInsertPrivileges.some((name) => name !== "schema_migrations")
  )
    throw new Error("Destination Auth capabilities do not match the reviewed plan.");
  const url = validateConnection(
    process.env.MIGRATION_TARGET_DATABASE_URL_DIRECT,
    target.projectRef,
  );
  const output = path.resolve(arg("output") ?? "");
  if (!output.startsWith(path.resolve("backup") + path.sep) || !output.endsWith(".json"))
    throw new Error("Store staging evidence inside backup/.");
  const archive = openArchive(
    await readFile(arg("archive")),
    process.env.BACKUP_ENCRYPTION_PASSPHRASE,
    source.projectRef,
  );
  let sql;
  let command;
  try {
    phase = "plan";
    const toc = decode(archive.plaintext, { command: ["--list"] }).toString();
    const plan = createStagePlan(toc, source, target, dependencies.dependencies);
    const planFile = output + ".plan.json";
    await writeFile(
      planFile,
      JSON.stringify(
        { ...plan, archiveSha256: createHash("sha256").update(archive.plaintext).digest("hex") },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    const listFile = output + ".restore-list";
    await writeFile(listFile, plan.selected.join("\n") + "\n", { flag: "wx", mode: 0o600 });
    phase = "decode-ordered-archive";
    sql = decode(archive.plaintext, {
      mounts: ["--mount", `type=bind,src=${listFile},dst=/restore.list,readonly`],
      command: ["--use-list=/restore.list", "--file=-"],
    });
    const authCopyOrder = [...sql.toString().matchAll(/^COPY (auth\.[a-z0-9_]+) \(/gm)].map(
      (match) => match[1],
    );
    if (JSON.stringify(authCopyOrder) !== JSON.stringify(plan.authDataOrder))
      throw new Error("Decoded Auth data does not follow the reviewed dependency order.");
    const marker = sql.indexOf(Buffer.from("\n-- Name:"));
    if (marker < 0 || marker > 32_000) throw new Error("Unexpected pg_restore header.");
    // Keep pg_restore's header before the transaction so its SET commands cannot
    // overwrite our local time/lock limits. All database changes are atomic.
    const guard = `
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(7261650326);
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S'))
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND NOT (
        p.proname='rls_auto_enable' AND p.pronargs=0 AND p.prosecdef
        AND pg_get_userbyid(p.proowner)='postgres'
        AND coalesce(p.proacl::text,'')='${reviewedTargetFunction.acl}'
        AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='${reviewedTargetFunction.definitionSha256}'))
    OR EXISTS (SELECT 1 FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND NOT (e.evtname='ensure_rls' AND e.evtevent='ddl_command_end'
        AND e.evtenabled='O' AND pg_get_userbyid(e.evtowner)='postgres'
        AND e.evttags=ARRAY['CREATE TABLE','CREATE TABLE AS','SELECT INTO']::text[]
        AND p.proname='rls_auto_enable'))
    OR EXISTS (SELECT 1 FROM auth.users)
    OR EXISTS (SELECT 1 FROM storage.objects)
    OR EXISTS (SELECT 1 FROM storage.buckets)
  THEN RAISE EXCEPTION 'Destination is not empty or contains unreviewed objects'; END IF;
END $guard$;
`;
    command = Buffer.concat([
      sql.subarray(0, marker),
      Buffer.from(guard),
      sql.subarray(marker),
      Buffer.from(
        `\n${stagingPrivilegesSql(source)}\n${stagingVerificationSql(source)}\nCOMMIT;NOTIFY pgrst, 'reload schema';SELECT 'TRACKIFY_STAGE_COMMITTED';\n`,
      ),
    ]);
    const sqlEvidence = {
      sqlBytes: command.length,
      sqlSha256: createHash("sha256").update(command).digest("hex"),
      productionCutoverAuthorized: false,
    };
    await writeFile(output + ".sql-evidence.json", JSON.stringify(sqlEvidence, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    if (!process.argv.includes("--stage-empty-target")) {
      console.log(
        JSON.stringify({
          planFile,
          selectedObjects: plan.selected.length,
          dataTables: plan.dataTables.length,
          ...sqlEvidence,
          applied: false,
        }),
      );
      return;
    }
    phase = "destination-transaction";
    const startedAt = new Date().toISOString();
    const result = await runDirectPsql({
      url,
      projectRef: target.projectRef,
      caFile: process.env.MIGRATION_TARGET_CA_FILE,
      input: command,
    });
    if (!result.toString().split(/\r?\n/).includes("TRACKIFY_STAGE_COMMITTED"))
      throw new Error("Commit confirmation missing; inspect destination before retrying.");
    const evidence = {
      sourceRef: source.projectRef,
      targetRef: target.projectRef,
      startedAt,
      completedAt: new Date().toISOString(),
      dataTables: plan.dataTables.length,
      verifiedTablesBeforeCommit: Object.keys(source.tables).filter((name) =>
        /^(public|auth)\./.test(name),
      ).length,
      status: "staged-and-verified-before-commit",
      storageFilesRestored: false,
      serviceLoginTested: false,
      productionCutoverAuthorized: false,
      followup:
        "Capture and compare the committed destination; restore Storage and test services before considering cutover.",
    };
    await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(evidence));
  } finally {
    archive.plaintext.fill(0);
    sql?.fill(0);
    command?.fill(0);
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      error:
        "Staging failed; production was not switched. Inspect destination state before retrying.",
      code: error.code ?? "STAGING_FAILED",
      category: error.category,
      phase,
    }),
  );
  process.exitCode = 1;
});
