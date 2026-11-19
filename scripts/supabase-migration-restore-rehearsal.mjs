import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { openArchive } from "./lib/migration-archive.mjs";
import { quoteIdentifier } from "./lib/supabase-migration-audit.mjs";
import { exerciseReturn } from "./lib/migration-return-rehearsal.mjs";

const image = "postgres@sha256:b60e90042aa6b8dbecd58e224b3e36114dbf8ad754465264c2476ad58a86e45c";
const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
};
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

function docker(args, { input, env, timeout = 60_000 } = {}) {
  const result = spawnSync("docker", args, {
    input,
    env: { ...process.env, ...env },
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    // Raw SQL and COPY errors can expose account data. Never print stderr.
    const stderr = result.stderr?.toString() ?? "";
    const error = new Error("Isolated restore command failed.");
    error.code = result.error?.code ?? "RESTORE_COMMAND_FAILED";
    error.category = /does not exist/.test(stderr)
      ? "missing-dependency"
      : /already exists/.test(stderr)
        ? "existing-object"
        : /permission denied/.test(stderr)
          ? "permission"
          : "command";
    // Object names from PostgreSQL diagnostics are metadata, never values/SQL.
    error.object = stderr.match(/(?:role|schema|extension|function|type) "([a-zA-Z0-9_.]+)"/)?.[1];
    throw error;
  }
  return result.stdout;
}

async function main() {
  const ref = arg("project-ref");
  const output = path.resolve(arg("output") ?? "");
  if (!output.startsWith(path.resolve("backup") + path.sep) || !output.endsWith(".json"))
    throw new Error("Evidence must be a new JSON file inside backup/.");
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  const archive = openArchive(await readFile(arg("archive")), passphrase, ref);
  const config = openArchive(await readFile(arg("service-config")), passphrase, ref);
  const roles = JSON.parse(config.plaintext).roleMetadata[0].metadata.roles;
  const baseline = JSON.parse(await readFile(arg("baseline"), "utf8"));
  if (baseline.projectRef !== ref || !baseline.tables["auth.users"])
    throw new Error("Baseline does not match the encrypted backup project.");
  const offline = ["run", "--rm", "-i", "--read-only", "--network", "none", "--cap-drop=ALL"];
  const toc = docker([...offline, image, "pg_restore", "--list"], { input: archive.plaintext })
    .toString()
    .split(/\r?\n/)
    .filter((line) => !/^\d+; \d+ \d+ SCHEMA - public /.test(line))
    .join("\n");
  const listFile = output + ".restore-list";
  try {
    await writeFile(listFile, toc + "\n", { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST" || (await readFile(listFile, "utf8")) !== toc + "\n") throw error;
  }
  const sql = docker(
    [
      ...offline,
      "--mount",
      `type=bind,src=${listFile},dst=/restore.list,readonly`,
      image,
      "pg_restore",
      "--use-list=/restore.list",
      "--schema=public",
      "--schema=auth",
      "--schema=storage",
      "--file=-",
    ],
    { input: archive.plaintext },
  );
  const name = `trackify-migration-rehearsal-${randomUUID()}`;
  let created = false;
  let stage = "start-isolated-database";
  try {
    docker(
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        name,
        "--network",
        "none",
        "--read-only",
        "--user",
        "postgres",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--memory=512m",
        "--cpus=1",
        "--tmpfs",
        "/var/lib/postgresql/data:rw,nosuid,noexec,size=256m,uid=999,gid=999",
        "--tmpfs",
        "/var/run/postgresql:rw,nosuid,noexec,size=16m,uid=999,gid=999",
        "--tmpfs",
        "/tmp:rw,nosuid,noexec,size=32m",
        "--env",
        "POSTGRES_PASSWORD",
        image,
      ],
      { env: { POSTGRES_PASSWORD: randomBytes(32).toString("hex") } },
    );
    created = true;
    const until = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < until) {
      const check = spawnSync(
        "docker",
        ["exec", name, "pg_isready", "-U", "postgres", "-d", "postgres"],
        { timeout: 5000 },
      );
      if (check.status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Isolated PostgreSQL did not become ready.");
    stage = "restore-transaction";
    const bootstrap = roles
      .filter((role) => role.rolname !== "postgres" && !role.rolname.startsWith("pg_"))
      .map((role) => `CREATE ROLE ${quoteIdentifier(role.rolname)} NOLOGIN;`)
      .join("\n");
    const input = Buffer.concat([
      Buffer.from(
        `${bootstrap}\nCREATE SCHEMA auth AUTHORIZATION supabase_admin;\nCREATE SCHEMA storage AUTHORIZATION supabase_admin;\nCREATE SCHEMA extensions;\nCREATE EXTENSION pgcrypto WITH SCHEMA extensions;\nCREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;\nSET LOCAL session_replication_role = replica;\n`,
      ),
      sql,
    ]);
    try {
      docker(
        [
          "exec",
          "-i",
          name,
          "psql",
          "-X",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "--single-transaction",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input, timeout: 120_000 },
      );
    } finally {
      input.fill(0);
    }
    stage = "verify-restored-data";
    const names = Object.keys(baseline.tables).filter((table) =>
      /^(public|auth|storage)\./.test(table),
    );
    const queries = names.map((name) => {
      const qualified = name.split(".").map(quoteIdentifier).join(".");
      return `SELECT ${literal(name)} as name, count(*)::int as count, encode(sha256(convert_to(coalesce(string_agg(hash,E'\\n' order by hash),''),'UTF8')),'hex') as sha256 FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') as hash FROM ONLY ${qualified} t) hashes`;
    });
    const verification = `BEGIN READ ONLY;SET LOCAL timezone='UTC';SET LOCAL datestyle='ISO, YMD';SET LOCAL intervalstyle='iso_8601';SET LOCAL extra_float_digits=3;SELECT json_agg(r) FROM (${queries.join(" UNION ALL ")}) r;ROLLBACK;`;
    const raw = docker(
      [
        "exec",
        "-i",
        name,
        "psql",
        "-X",
        "-q",
        "-A",
        "-t",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: verification },
    );
    const restored = JSON.parse(raw.toString());
    if (restored.length !== names.length) throw new Error("Incomplete restored-data evidence.");
    const differences = restored
      .filter(
        (row) =>
          row.count !== baseline.tables[row.name].count ||
          row.sha256 !== baseline.tables[row.name].sha256,
      )
      .map((row) => row.name);
    const integrityRaw = docker([
      "exec",
      name,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "SELECT jsonb_build_object('invalidConstraints',(SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname IN ('public','auth','storage') AND NOT k.convalidated),'invalidIndexes',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND (NOT i.indisvalid OR NOT i.indisready)))",
    ]);
    const integrity = JSON.parse(integrityRaw.toString());
    let returnRehearsal;
    if (process.argv.includes("--exercise-return")) {
      if (differences.length || integrity.invalidIndexes || integrity.invalidConstraints)
        throw new Error("Verified restoration required before return rehearsal.");
      stage = "exercise-return";
      returnRehearsal = exerciseReturn({ docker, name, verification });
    }
    const evidence = {
      sourceRef: ref,
      capturedAt: new Date().toISOString(),
      image,
      archiveSha256: createHash("sha256").update(archive.plaintext).digest("hex"),
      network: "none",
      publishedPorts: 0,
      persistence: "tmpfs; container removed after rehearsal",
      restoredTables: restored,
      differencesFromBaseline: differences,
      integrity,
      ...(returnRehearsal ? { returnRehearsal } : {}),
      restoredSuccessfully: true,
      productionCutoverAuthorized: false,
      limitations: [
        "Isolated PostgreSQL rehearsal of public, auth and storage; not a hosted Supabase restoration.",
        "Vault is excluded (empty in the baseline); managed extension compatibility requires separate review.",
        "Roles are NOLOGIN stubs. OAuth, passwords, service permissions and Storage object bytes are not tested here.",
        "A different capture time can explain drift; never silently ignore differences.",
      ],
    };
    await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({
        restoredTables: restored.length,
        differences,
        integrity,
        returnRehearsal,
        evidence: output,
      }),
    );
    if (differences.length || integrity.invalidConstraints || integrity.invalidIndexes)
      process.exitCode = 2;
  } catch (error) {
    error.stage = stage;
    throw error;
  } finally {
    if (created) docker(["stop", "--time=5", name]);
    archive.plaintext.fill(0);
    config.plaintext.fill(0);
    sql.fill(0);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: "Isolated restore rehearsal failed; source and destination were not modified.",
      code: error.code ?? "REHEARSAL_FAILED",
      stage: error.stage,
      category: error.category,
      object: error.object,
    }),
  );
  process.exitCode = 1;
});
