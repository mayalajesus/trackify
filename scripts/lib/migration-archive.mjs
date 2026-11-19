import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

const magic = Buffer.from("TRACKIFY-MIGRATION-1\n");
const maxBytes = 64 * 1024 * 1024;

export function sealArchive(plaintext, passphrase, projectRef) {
  if (!Buffer.isBuffer(plaintext) || plaintext.length > maxBytes || !plaintext.length)
    throw new Error("Invalid backup size.");
  if (typeof passphrase !== "string" || passphrase.length < 16)
    throw new Error("A strong backup passphrase is required.");
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("Invalid backup project.");
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const header = Buffer.from(
    JSON.stringify({
      format: 1,
      projectRef,
      createdAt: new Date().toISOString(),
      cipher: "aes-256-gcm",
      kdf: "scrypt-N16384-r8-p1",
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      bytes: plaintext.length,
      sha256: createHash("sha256").update(plaintext).digest("hex"),
    }),
  );
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  key.fill(0);
  return Buffer.concat([magic, length, header, encrypted, cipher.getAuthTag()]);
}

export function openArchive(archive, passphrase, expectedRef) {
  if (
    !Buffer.isBuffer(archive) ||
    archive.length < magic.length + 4 + 16 ||
    archive.length > maxBytes + 8192 ||
    !archive.subarray(0, magic.length).equals(magic)
  )
    throw new Error("Invalid migration archive.");
  const length = archive.readUInt32BE(magic.length),
    start = magic.length + 4;
  if (length < 1 || length > 4096 || start + length + 16 >= archive.length)
    throw new Error("Invalid archive header.");
  const header = archive.subarray(start, start + length),
    meta = JSON.parse(header);
  if (
    meta.format !== 1 ||
    meta.projectRef !== expectedRef ||
    meta.cipher !== "aes-256-gcm" ||
    meta.kdf !== "scrypt-N16384-r8-p1" ||
    !/^[a-f0-9]{32}$/.test(meta.salt ?? "") ||
    !/^[a-f0-9]{24}$/.test(meta.iv ?? "")
  )
    throw new Error("Archive identity or format mismatch.");
  const key = scryptSync(passphrase, Buffer.from(meta.salt, "hex"), 32, { N: 16384, r: 8, p: 1 });
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(meta.iv, "hex"));
    decipher.setAAD(header);
    decipher.setAuthTag(archive.subarray(-16));
    const plaintext = Buffer.concat([
      decipher.update(archive.subarray(start + length, -16)),
      decipher.final(),
    ]);
    if (
      plaintext.length !== meta.bytes ||
      createHash("sha256").update(plaintext).digest("hex") !== meta.sha256
    )
      throw new Error("Archive integrity failed.");
    return { metadata: meta, plaintext };
  } finally {
    key.fill(0);
  }
}
