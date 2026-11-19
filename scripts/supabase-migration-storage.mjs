import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pbkdf2Sync, createDecipheriv, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { openArchive } from "./lib/migration-archive.mjs";
import { POSTGRES_IMAGE } from "./lib/migration-postgres.mjs";
import { assertMigrationCandidate } from "./lib/migration-project-status.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const digest = (data, algorithm = "sha256") => createHash(algorithm).update(data).digest("hex");
let phase = "inspect-backup";

function safeArchivePath(value) {
  const name = value.replace(/^\.\//, "");
  if (!/^[a-zA-Z0-9/._-]+$/.test(name) || name.startsWith("/") || name.split("/").includes(".."))
    throw new Error("Unsafe backup path.");
  return name;
}
function tar(gzip, args) {
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
      POSTGRES_IMAGE,
      "tar",
      ...args,
    ],
    { input: gzip, timeout: 30_000, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error("Backup TAR verification failed.");
  return result.stdout;
}
function verifiedStorageFiles(encrypted, passphrase) {
  if (encrypted.subarray(0, 8).toString() !== "Salted__")
    throw new Error("Unexpected historical backup format.");
  const derived = pbkdf2Sync(passphrase, encrypted.subarray(8, 16), 10_000, 48, "sha256");
  const decipher = createDecipheriv("aes-256-cbc", derived.subarray(0, 32), derived.subarray(32));
  const gzip = Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]);
  derived.fill(0);
  const payloads = new Map();
  try {
    const names = tar(gzip, ["-tzf", "-"])
      .toString()
      .trim()
      .split(/\r?\n/)
      .filter((name) => !name.endsWith("/"));
    const mapping = new Map(names.map((name) => [safeArchivePath(name), name]));
    if (mapping.size !== names.length || names.length > 100 || !mapping.has("SHA256SUMS"))
      throw new Error("Unexpected backup members.");
    const checksums = tar(gzip, ["-xOzf", "-", "--", mapping.get("SHA256SUMS")])
      .toString()
      .trim()
      .split(/\r?\n/);
    if (checksums.length !== names.length - 1) throw new Error("Backup checksum coverage differs.");
    const checked = new Set();
    for (const line of checksums) {
      const match = line.match(/^([a-f0-9]{64}) [ *](.+)$/);
      if (!match) throw new Error("Malformed checksum manifest.");
      const name = safeArchivePath(match[2]);
      if (!mapping.has(name) || checked.has(name))
        throw new Error("Unexpected or duplicated checksum path.");
      const data = tar(gzip, ["-xOzf", "-", "--", mapping.get(name)]);
      if (digest(data) !== match[1]) throw new Error("Backup file checksum differs.");
      checked.add(name);
      if (name.startsWith("storage/")) payloads.set(name, data);
      else data.fill(0);
    }
    const manifest = JSON.parse(payloads.get("storage/manifest.json")?.toString() ?? "null");
    if (!Array.isArray(manifest) || manifest.length !== payloads.size - 1)
      throw new Error("Storage manifest coverage differs.");
    const seen = new Set();
    const objects = manifest.map((object) => {
      if (!["avatars", "workspace-logos"].includes(object.bucket))
        throw new Error("Unexpected Storage bucket.");
      const name = safeArchivePath(`storage/${object.bucket}/${object.path}`);
      const data = payloads.get(name);
      if (!data || seen.has(name) || data.length !== object.bytes || digest(data) !== object.sha256)
        throw new Error("Storage manifest integrity differs.");
      seen.add(name);
      return { ...object, data };
    });
    return { objects, verifiedFiles: checked.size };
  } catch (error) {
    for (const data of payloads.values()) data.fill(0);
    throw error;
  } finally {
    gzip.fill(0);
  }
}
async function main() {
  const sourceRef = arg("source-ref"),
    targetRef = arg("target-ref");
  assertMigrationCandidate(targetRef);
  if (
    !/^[a-z]{20}$/.test(sourceRef ?? "") ||
    !/^[a-z]{20}$/.test(targetRef ?? "") ||
    sourceRef === targetRef
  )
    throw new Error("Distinct project identities are required.");
  const output = path.resolve(arg("output") ?? "");
  if (!output.startsWith(path.resolve("backup") + path.sep) || !output.endsWith(".json"))
    throw new Error("Store evidence in backup/.");
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  const config = openArchive(await readFile(arg("metadata")), passphrase, sourceRef);
  const metadata = JSON.parse(config.plaintext);
  config.plaintext.fill(0);
  const backup = verifiedStorageFiles(await readFile(arg("archive")), passphrase);
  try {
    if (
      metadata.sourceRef !== sourceRef ||
      metadata.objects.length !== backup.objects.length ||
      metadata.buckets.some((bucket) => bucket.public !== false || bucket.name !== bucket.id) ||
      metadata.objects.some((object) => object.owner != null || object.owner_id != null)
    )
      throw new Error("Storage metadata needs separate review.");
    for (const object of backup.objects) {
      const source = metadata.objects.find(
        (item) => item.bucket_id === object.bucket && item.name === object.path,
      );
      const etag = String(source?.metadata?.eTag ?? source?.metadata?.etag ?? "")
        .replace(/^W\//, "")
        .replaceAll('"', "");
      if (
        !source ||
        Number(source.metadata?.size) !== object.bytes ||
        digest(object.data, "md5") !== etag.toLowerCase()
      )
        throw new Error("Storage object differs from source metadata.");
      object.metadata = source.metadata;
    }
    if (!process.argv.includes("--restore")) {
      console.log(
        JSON.stringify({
          verifiedFiles: backup.verifiedFiles,
          objects: backup.objects.length,
          bytes: backup.objects.reduce((sum, object) => sum + object.bytes, 0),
          allPrivate: true,
          applied: false,
        }),
      );
      return;
    }
    phase = "validate-staged-destination";
    const staged = JSON.parse(await readFile(arg("stage-evidence"), "utf8"));
    if (
      staged.sourceRef !== sourceRef ||
      staged.targetRef !== targetRef ||
      staged.status !== "staged-and-verified-before-commit"
    )
      throw new Error("A verified destination staging result is required.");
    const response = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/api-keys`, {
      headers: { Authorization: `Bearer ${process.env.MIGRATION_TARGET_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Destination service credential unavailable.");
    const key = (await response.json()).find((item) => item.name === "service_role")?.api_key;
    const claims = JSON.parse(Buffer.from(key?.split(".")[1] ?? "", "base64url").toString());
    if (claims.ref !== targetRef || claims.role !== "service_role")
      throw new Error("Service credential does not match destination.");
    const client = createClient(`https://${targetRef}.supabase.co`, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    phase = "restore-private-buckets";
    for (const bucket of metadata.buckets) {
      let { data, error } = await client.storage.getBucket(bucket.id);
      if (error && ![400, 404].includes(Number(error.status)))
        throw new Error("Could not inspect destination bucket.");
      if (!data) {
        const created = await client.storage.createBucket(bucket.id, {
          public: false,
          fileSizeLimit: bucket.file_size_limit ?? undefined,
          allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
        });
        if (created.error) throw new Error("Could not create private destination bucket.");
        ({ data, error } = await client.storage.getBucket(bucket.id));
      }
      const sorted = (list) => (list ? [...list].sort() : null);
      if (
        error ||
        !data ||
        data.public !== false ||
        Number(data.file_size_limit) !== Number(bucket.file_size_limit) ||
        JSON.stringify(sorted(data.allowed_mime_types)) !==
          JSON.stringify(sorted(bucket.allowed_mime_types))
      )
        throw new Error("Destination bucket configuration differs.");
    }
    phase = "restore-and-verify-objects";
    const results = [];
    for (const object of backup.objects) {
      const storage = client.storage.from(object.bucket);
      let { data, error } = await storage.download(object.path);
      if (error && ![400, 404].includes(Number(error.status)))
        throw new Error("Could not inspect destination object.");
      if (!data) {
        const cacheControl = String(object.metadata.cacheControl ?? "3600").match(
          /(?:max-age=)?(\d+)/,
        )?.[1];
        const uploaded = await storage.upload(object.path, object.data, {
          contentType: object.metadata.mimetype,
          cacheControl,
          upsert: false,
        });
        if (uploaded.error || uploaded.data.path !== object.path)
          throw new Error("Destination upload failed; no object was overwritten.");
        ({ data, error } = await storage.download(object.path));
      }
      if (error || !data) throw new Error("Destination verification download failed.");
      const downloaded = Buffer.from(await data.arrayBuffer());
      const matches = downloaded.length === object.bytes && digest(downloaded) === object.sha256;
      downloaded.fill(0);
      if (!matches) throw new Error("Destination bytes differ; object was not overwritten.");
      results.push({
        bucket: object.bucket,
        bytes: object.bytes,
        sha256: object.sha256,
        verified: true,
      });
    }
    const evidence = {
      sourceRef,
      targetRef,
      completedAt: new Date().toISOString(),
      buckets: metadata.buckets.length,
      objects: results,
      verifiedBackupFiles: backup.verifiedFiles,
      private: true,
      pathsPreserved: true,
      storageInternalIdsPreserved: false,
      note: "Storage service generates object IDs, versions and timestamps; application paths and file bytes are preserved.",
      productionCutoverAuthorized: false,
    };
    await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({
        buckets: evidence.buckets,
        objects: results.length,
        bytes: results.reduce((sum, object) => sum + object.bytes, 0),
        allDownloadsVerified: true,
        productionCutoverAuthorized: false,
      }),
    );
  } finally {
    for (const object of backup.objects) object.data.fill(0);
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      error:
        "Storage preparation failed; source and production routing were not modified. Existing destination objects were not overwritten.",
      phase,
    }),
  );
  process.exitCode = 1;
});
