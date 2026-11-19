import { test } from "node:test";
import assert from "node:assert/strict";
import { sealArchive, openArchive } from "../../scripts/lib/migration-archive.mjs";

const ref = "aaaaaaaaaaaaaaaaaaaa";
const pass = "synthetic-backup-passphrase-only";
test("encrypted migration backup round-trips bytes without exposing original content", () => {
  const input = Buffer.from("PGDMP synthetic account data \0\xff", "utf8");
  const archive = sealArchive(input, pass, ref);
  assert.ok(!archive.includes(Buffer.from("synthetic account data")));
  assert.deepEqual(openArchive(archive, pass, ref).plaintext, input);
  assert.notDeepEqual(sealArchive(input, pass, ref), archive);
});
test("wrong project, wrong passphrase, tampering and truncation are rejected", () => {
  const archive = sealArchive(Buffer.from("PGDMP fixture"), pass, ref);
  assert.throws(() => openArchive(archive, pass, "bbbbbbbbbbbbbbbbbbbb"));
  assert.throws(() => openArchive(archive, "wrong passphrase", ref));
  const tampered = Buffer.from(archive);
  tampered[tampered.length - 17] ^= 1;
  assert.throws(() => openArchive(tampered, pass, ref));
  assert.throws(() => openArchive(archive.subarray(0, -1), pass, ref));
  assert.throws(() => sealArchive(Buffer.from("fixture"), "short", ref));
});
