import net from "node:net";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { validateConnection } from "./supabase-migration-audit.mjs";

export const POSTGRES_IMAGE =
  "postgres@sha256:b60e90042aa6b8dbecd58e224b3e36114dbf8ad754465264c2476ad58a86e45c";

// Docker Desktop cannot reach the direct IPv6 endpoint on this host. Forward only
// localhost to the validated database. TLS stays end-to-end inside libpq.
export function runDirectPsql(options) {
  return runDirectCommand(options);
}
export function runDirectDump(options) {
  return runDirectCommand({ ...options, dump: true });
}

async function runDirectCommand({
  url,
  projectRef,
  caFile,
  input,
  timeoutMs = 600_000,
  dump = false,
  snapshot,
}) {
  if (snapshot !== undefined && !/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/i.test(snapshot))
    throw new Error("Invalid exported snapshot.");
  const maxBytes = (dump ? 64 : 4) * 1024 * 1024;
  const target = new URL(validateConnection(url, projectRef));
  if (target.hostname !== `db.${projectRef}.supabase.co` || target.username !== "postgres")
    throw new Error("An explicit direct destination connection is required.");
  await readFile(caFile);
  const lookup = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--read-only",
      "--cap-drop=ALL",
      POSTGRES_IMAGE,
      "getent",
      "ahostsv4",
      "host.docker.internal",
    ],
    { encoding: "utf8", timeout: 20_000 },
  );
  const hostAddress = lookup.stdout?.trim().split(/\s+/)[0];
  if (lookup.status !== 0 || !/^192\.168\.\d+\.\d+$/.test(hostAddress ?? ""))
    throw new Error("Expected Docker Desktop internal host unavailable.");
  const sockets = new Set();
  const server = net.createServer((client) => {
    const remote = net.connect({ host: target.hostname, port: 5432 }, () => {
      client.pipe(remote);
      remote.pipe(client);
    });
    for (const socket of [client, remote]) {
      sockets.add(socket);
      socket.setNoDelay(true);
      socket.setTimeout(timeoutMs, () => {
        client.destroy();
        remote.destroy();
      });
      socket.on("error", () => {
        client.destroy();
        remote.destroy();
      });
      socket.on("close", () => sockets.delete(socket));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const env = {
      PGHOST: target.hostname,
      PGHOSTADDR: hostAddress,
      PGPORT: String(server.address().port),
      PGUSER: "postgres",
      PGPASSWORD: decodeURIComponent(target.password),
      PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: "/certs/ca.crt",
      PGCONNECT_TIMEOUT: "30",
      ...(dump
        ? {
            PGOPTIONS:
              "-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=3000",
          }
        : {}),
    };
    const args = [
      "run",
      "--rm",
      "-i",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--mount",
      `type=bind,src=${path.resolve(caFile)},dst=/certs/ca.crt,readonly`,
      ...Object.keys(env).flatMap((key) => ["--env", key]),
      POSTGRES_IMAGE,
      ...(dump
        ? [
            "pg_dump",
            "--format=custom",
            "--no-password",
            "--schema=public",
            "--schema=auth",
            "--schema=storage",
            "--schema=vault",
            ...(snapshot ? [`--snapshot=${snapshot}`] : []),
          ]
        : ["psql", "-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1"]),
    ];
    return await new Promise((resolve, reject) => {
      const child = spawn("docker", args, {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const chunks = [];
      let bytes = 0;
      let diagnostic = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(
          Object.assign(
            new Error(
              "Destination command timed out; inspect transaction outcome before retrying.",
            ),
            { code: "DESTINATION_TIMEOUT" },
          ),
        );
      }, timeoutMs);
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) child.kill();
        else chunks.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        if (diagnostic.length < 16_000) diagnostic += chunk.toString();
      });
      child.stdin.on("error", () => {
        /* Close handler reports failure without leaking input. */
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && bytes <= maxBytes) resolve(Buffer.concat(chunks));
        else {
          const error = new Error(
            "Destination command failed; inspect transaction outcome before retrying.",
          );
          error.code = "DESTINATION_COMMAND_FAILED";
          error.category = /not empty/.test(diagnostic)
            ? "destination-not-empty"
            : /verification failed/.test(diagnostic)
              ? "data-verification"
              : /permission denied/.test(diagnostic)
                ? "permission"
                : /does not exist/.test(diagnostic)
                  ? "missing-dependency"
                  : "command";
          reject(error);
        }
      });
      child.stdin.end(input);
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}
