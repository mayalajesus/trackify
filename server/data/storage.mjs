import { createHash, randomUUID } from "node:crypto";
import { DataApiError } from "../data-api-error.mjs";
import { getSupabaseAdmin } from "./connections.mjs";

export async function signedStorageUrl(config, bucket, path) {
  if (!path || config.databaseProvider !== "supabase") return null;
  const { data, error } = await getSupabaseAdmin(config)
    .storage.from(bucket)
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) throw new DataApiError(500, `Could not load ${bucket} media.`);
  return data.signedUrl;
}

export function workspaceLogoPath(workspaceId, image, currentPath = null) {
  const digest = createHash("sha256").update(image.contentType).update(image.bytes).digest("hex");
  if (currentPath?.endsWith(`-${digest}`)) return currentPath;
  // Never overwrite a cached object, or reuse a path scheduled for deletion.
  return `${workspaceId}/${randomUUID()}-${digest}`;
}
