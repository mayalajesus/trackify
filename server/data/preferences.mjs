import { DataApiError } from "../data-api-error.mjs";

import { getSupabaseAdmin } from "./connections.mjs";

import { uuid } from "./validation.mjs";

import { requiredText } from "./validation.mjs";

import { avatarDataValue } from "./validation.mjs";

import { signedStorageUrl } from "./storage.mjs";

import { parseImageDataUrl } from "./validation.mjs";

import { favoriteTasksValue } from "./validation.mjs";

import { reportFiltersJson } from "./validation.mjs";

import { hasColumn } from "./access.mjs";

import { requireWorkspaceAccess } from "./access.mjs";

import { ensureProfile } from "./profile.mjs";

export async function updateProfileName(client, user, config, body) {
  const name = requiredText(body.name, "Profile name", 120);
  await ensureProfile(client, user, config);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  await client.query(
    `update public.profiles
        set name = $2, initials = $3, updated_at = now()
      where id = $1`,
    [user.id, name, initials],
  );
  return null;
}

export async function uploadAvatar(client, user, config, body) {
  const image = parseImageDataUrl(body.avatarDataUrl);
  if (!image || image.bytes.byteLength === 0) {
    throw new DataApiError(400, "Choose a valid profile photo.");
  }
  await ensureProfile(client, user, config);

  if (config.databaseProvider !== "supabase") {
    await updatePreferences(client, user, config, {
      patch: { avatarUrl: body.avatarDataUrl },
    });
    return body.avatarDataUrl;
  }

  const current = await client.query(`select avatar_path from public.profiles where id = $1`, [
    user.id,
  ]);
  const previousPath = current.rows[0]?.avatar_path ?? null;
  const extension =
    image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;
  const storage = getSupabaseAdmin(config).storage.from("avatars");
  const uploaded = await storage.upload(path, image.bytes, {
    contentType: image.contentType,
    upsert: false,
  });
  if (uploaded.error) throw new DataApiError(500, "Could not save the profile photo.");

  let signedUrl;
  try {
    signedUrl = await signedStorageUrl(config, "avatars", path);
    await client.query(
      `update public.profiles set avatar_path = $2, updated_at = now() where id = $1`,
      [user.id, path],
    );
    await client.query(
      `update public.user_preferences set avatar_data_url = null, updated_at = now() where user_id = $1`,
      [user.id],
    );
  } catch (error) {
    await storage.remove([path]);
    throw error;
  }

  if (previousPath && previousPath !== path) {
    const removed = await storage.remove([previousPath]);
    if (removed.error) console.error("Could not remove the previous profile photo.");
  }
  return signedUrl;
}

export async function removeAvatar(client, user, config) {
  await ensureProfile(client, user, config);
  if (config.databaseProvider !== "supabase") {
    await updatePreferences(client, user, config, { patch: { avatarUrl: null } });
    return null;
  }

  const current = await client.query(`select avatar_path from public.profiles where id = $1`, [
    user.id,
  ]);
  const path = current.rows[0]?.avatar_path ?? null;
  await client.query(
    `update public.profiles set avatar_path = null, updated_at = now() where id = $1`,
    [user.id],
  );
  await client.query(
    `update public.user_preferences set avatar_data_url = null, updated_at = now() where user_id = $1`,
    [user.id],
  );
  if (!path) return null;

  const removed = await getSupabaseAdmin(config).storage.from("avatars").remove([path]);
  if (!removed.error) return null;
  await client.query(
    `update public.profiles set avatar_path = $2, updated_at = now() where id = $1`,
    [user.id, path],
  );
  throw new DataApiError(500, "Could not remove the profile photo.");
}

export async function updatePreferences(client, user, config, body) {
  const patch = body.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new DataApiError(400, "Invalid preferences payload.");
  }
  const allowedKeys = new Set([
    "idleDetection",
    "language",
    "theme",
    "avatarUrl",
    "timezone",
    "activeWorkspaceId",
    "reportFilters",
    "favoriteTasks",
  ]);
  if (Object.keys(patch).some((key) => !allowedKeys.has(key))) {
    throw new DataApiError(400, "Invalid preferences payload.");
  }
  await ensureProfile(client, user, config);
  const updates = [];
  const values = [user.id];
  const addValue = (column, value, cast = "") => {
    values.push(value);
    updates.push(`${column} = $${values.length}${cast}`);
  };
  if (patch.favoriteTasks !== undefined) {
    addValue("favorite_tasks", JSON.stringify(favoriteTasksValue(patch.favoriteTasks)), "::jsonb");
  }
  if (patch.idleDetection !== undefined) {
    if (typeof patch.idleDetection !== "boolean")
      throw new DataApiError(400, "Choose a valid idle detection preference.");
    addValue("idle_detection", patch.idleDetection);
  }
  if (patch.language !== undefined) {
    if (patch.language !== "en-US" && patch.language !== "pt-BR")
      throw new DataApiError(400, "Choose a valid language.");
    addValue("language", patch.language);
  }
  if (patch.theme !== undefined) {
    if (!["system", "light", "dark"].includes(patch.theme))
      throw new DataApiError(400, "Choose a valid theme.");
    addValue("theme", patch.theme);
  }
  if (patch.avatarUrl !== undefined) {
    if (!(await hasColumn(client, "user_preferences", "avatar_data_url"))) {
      throw new DataApiError(500, "Profile photo persistence is unavailable.");
    }
    const avatarUrl = avatarDataValue(patch.avatarUrl);
    if (patch.avatarUrl !== null && avatarUrl === null) {
      throw new DataApiError(400, "Choose a valid profile photo.");
    }
    addValue("avatar_data_url", avatarUrl);
  }
  if (patch.timezone !== undefined) {
    if (typeof patch.timezone !== "string" || !patch.timezone.trim())
      throw new DataApiError(400, "Choose a valid timezone.");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: patch.timezone }).format();
    } catch {
      throw new DataApiError(400, "Choose a valid timezone.");
    }
    addValue("timezone", patch.timezone);
  }
  if (
    patch.reportFilters !== undefined &&
    (await hasColumn(client, "user_preferences", "report_filters"))
  ) {
    if (
      !patch.reportFilters ||
      typeof patch.reportFilters !== "object" ||
      Array.isArray(patch.reportFilters)
    ) {
      throw new DataApiError(400, "Choose valid report filters.");
    }
    addValue("report_filters", reportFiltersJson(patch.reportFilters), "::jsonb");
  }
  if (
    patch.activeWorkspaceId !== undefined &&
    (await hasColumn(client, "user_preferences", "active_workspace_id"))
  ) {
    const workspaceId = patch.activeWorkspaceId === null ? null : uuid(patch.activeWorkspaceId);
    if (workspaceId) await requireWorkspaceAccess(client, user.id, workspaceId);
    addValue("active_workspace_id", workspaceId, "::uuid");
  }
  if (updates.length === 0) return null;
  await client.query(
    `update public.user_preferences
        set ${updates.join(", ")}, updated_at = now()
      where user_id = $1`,
    values,
  );
  return null;
}
