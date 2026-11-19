import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";
import { sealArchive, openArchive } from "./lib/migration-archive.mjs";
import { runDirectDump } from "./lib/migration-postgres.mjs";

const image = "postgres@sha256:b60e90042aa6b8dbecd58e224b3e36114dbf8ad754465264c2476ad58a86e45c";
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};

async function main() {
  const ref = arg("project-ref"),
    output = path.resolve(arg("output") ?? "");
  if (!output.startsWith(path.resolve("backup") + path.sep) || !output.endsWith(".dump.enc"))
    throw new Error("Backup must be a new encrypted file inside backup/.");
  const url = new URL(validateConnection(process.env.MIGRATION_SOURCE_DATABASE_URL, ref));
  const caFile = path.resolve(process.env.MIGRATION_SOURCE_CA_FILE ?? "");
  await readFile(caFile); // Fail before creating a container if CA is unavailable.
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (!passphrase || passphrase.length < 16) throw new Error("Backup passphrase unavailable.");
  const snapshot = arg("snapshot");
  if (snapshot !== undefined && !/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/i.test(snapshot))
    throw new Error("Invalid PostgreSQL exported snapshot.");
  const env = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: "/certs/ca.crt",
    PGCONNECT_TIMEOUT: "30",
    PGOPTIONS:
      "-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=3000",
  };
  const args = [
    "run",
    "--rm",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--mount",
    `type=bind,src=${caFile},dst=/certs/ca.crt,readonly`,
    ...Object.keys(env).flatMap((key) => ["--env", key]),
    image,
    "pg_dump",
    "--format=custom",
    "--no-password",
    "--schema=public",
    "--schema=auth",
    "--schema=storage",
    "--schema=vault",
    ...(snapshot ? [`--snapshot=${snapshot}`] : []),
  ];
  const startedAt = new Date().toISOString();
  const plaintext = process.argv.includes("--direct-bridge")
    ? await runDirectDump({ url: url.href, projectRef: ref, caFile, snapshot })
    : await new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        });
        const chunks = [];
        let bytes = 0,
          overflow = false;
        let diagnostic = "";
        const deadline = setTimeout(() => {
          child.kill();
          reject(Object.assign(new Error("Backup deadline exceeded."), { code: "BACKUP_TIMEOUT" }));
        }, 600000);
        child.stdout.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 64 * 1024 * 1024) {
            overflow = true;
            child.kill();
          } else chunks.push(chunk);
        });
        // Keep only bounded diagnostic input in memory; never echo raw pg_dump errors or SQL.
        child.stderr.on("data", (chunk) => {
          if (diagnostic.length < 16000) diagnostic += chunk.toString();
        });
        child.on("error", (error) => {
          clearTimeout(deadline);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(deadline);
          if (code !== 0 || overflow) {
            const reason = overflow
              ? "BACKUP_SIZE_LIMIT"
              : /timeout|timed out/i.test(diagnostic)
                ? "BACKUP_CONNECTION_TIMEOUT"
                : /permission denied/i.test(diagnostic)
                  ? "BACKUP_PERMISSION_DENIED"
                  : /network is unreachable/i.test(diagnostic)
                    ? "BACKUP_NETWORK_UNREACHABLE"
                    : "BACKUP_PROCESS_FAILED";
            reject(Object.assign(new Error("Backup process failed."), { code: reason }));
          } else resolve(Buffer.concat(chunks));
        });
      });
  if (plaintext.subarray(0, 5).toString() !== "PGDMP")
    throw new Error("Invalid PostgreSQL archive.");
  const encrypted = sealArchive(plaintext, passphrase, ref);
  const verified = openArchive(encrypted, passphrase, ref);
  if (!verified.plaintext.equals(plaintext)) throw new Error("Backup round trip failed.");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, encrypted, { flag: "wx", mode: 0o600 });
  const manifest = {
    ...verified.metadata,
    startedAt,
    image,
    encryptedSha256: createHash("sha256").update(encrypted).digest("hex"),
    schemas: ["public", "auth", "storage", "vault"],
    storageObjectBytesIncluded: false,
    ...(snapshot ? { exportedSnapshot: snapshot } : {}),
    notes:
      "Database archive only. Storage bytes, service settings and global roles require separate preservation. Production cutover is not authorized.",
  };
  await writeFile(output + ".json", JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  plaintext.fill(0);
  verified.plaintext.fill(0);
  console.log(
    JSON.stringify({
      projectRef: ref,
      output,
      bytes: manifest.bytes,
      encryptedSha256: manifest.encryptedSha256,
      productionCutoverAuthorized: false,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: "Migration backup failed; no production changes requested.",
      code: /^[A-Z0-9_]{2,40}$/.test(error?.code ?? "") ? error.code : "BACKUP_FAILED",
    }),
  );
  process.exitCode = 1;
});
