import { createHash, randomUUID } from "node:crypto";
import { DataApiError } from "../data-api-error.mjs";
import { getSupabaseAdmin } from "./connections.mjs";

const signedUrls = new Map();
const MAX_SIGNED_URLS = 512;
const URL_LIFETIME = 24 * 60 * 60_000;
const RENEW_BEFORE = 5 * 60_000;

export async function signedStorageUrl(config, bucket, path) {
  if (!path || config.databaseProvider !== "supabase") return null;
  // Authorization belongs to the caller. Only immutable object URLs are shared,
  // scoped to the project and server credential, never account snapshots.
  const key = JSON.stringify([
    config.supabaseUrl,
    createHash("sha256")
      .update(config.supabaseServiceRoleKey ?? "")
      .digest("hex"),
    bucket,
    path,
  ]);
  const cached = signedUrls.get(key);
  if (cached && cached.expiresAt > Date.now() + RENEW_BEFORE) return cached.promise;
  const entry = { expiresAt: Date.now() + URL_LIFETIME, promise: null };
  entry.promise = (async () => {
    const { data, error } = await getSupabaseAdmin(config)
      .storage.from(bucket)
      .createSignedUrl(path, URL_LIFETIME / 1000);
    if (error) throw new DataApiError(500, `Could not load ${bucket} media.`);
    return data.signedUrl;
  })().catch((error) => {
    if (signedUrls.get(key) === entry) signedUrls.delete(key);
    throw error;
  });
  signedUrls.delete(key);
  signedUrls.set(key, entry);
  while (signedUrls.size > MAX_SIGNED_URLS) signedUrls.delete(signedUrls.keys().next().value);
  return entry.promise;
}

export function workspaceLogoPath(workspaceId, image, currentPath = null) {
  const digest = createHash("sha256").update(image.contentType).update(image.bytes).digest("hex");
  if (currentPath?.endsWith(`-${digest}`)) return currentPath;
  // Never overwrite a cached object, or reuse a path scheduled for deletion.
  return `${workspaceId}/${randomUUID()}-${digest}`;
}
