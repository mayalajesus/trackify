import { randomUUID } from "node:crypto";
import { DataApiError } from "../data-api-error.mjs";
import { hasColumn } from "./access.mjs";
import { loadAccount } from "./account.mjs";
import { getSupabaseAdmin } from "./connections.mjs";
import { ensureProfile } from "./profile.mjs";
import { workspaceLogoPath } from "./storage.mjs";
import { membershipBilling, parseImageDataUrl, requiredText } from "./validation.mjs";

export async function createWorkspace(client, user, config, body) {
  await ensureProfile(client, user, config);
  const name = requiredText(body.name, "Workspace name", 120).replace(/\s+/g, " ");
  const billing = membershipBilling({
    hourlyRate: body.hourlyRate,
    currency: body.currency,
  });
  await client.query(
    `select pg_advisory_xact_lock(hashtextextended('minvio:workspace-create:' || $1, 0))`,
    [user.id],
  );
  const owned = await client.query(
    `select count(*)::integer as count
       from public.workspaces
      where owner_id = $1`,
    [user.id],
  );
  if (Number(owned.rows[0]?.count ?? 0) >= 5) {
    throw new DataApiError(409, "You can create up to 5 workspaces.");
  }

  let logo = null;
  if (body.logoDataUrl !== undefined && body.logoDataUrl !== null) {
    logo = parseImageDataUrl(body.logoDataUrl);
    if (!logo) throw new DataApiError(400, "Choose a valid PNG, JPG or WebP logo.");
    if (logo.bytes.byteLength > 500_000) {
      throw new DataApiError(400, "Workspace logos must be smaller than 500 KB.");
    }
  }

  const workspaceId = randomUUID();
  await client.query(
    `insert into public.workspaces (id, name, owner_id, status)
     values ($1, $2, $3, 'active')`,
    [workspaceId, name, user.id],
  );
  await client.query(
    `update public.workspace_members
        set hourly_rate = $3, currency = $4
      where workspace_id = $1 and user_id = $2`,
    [workspaceId, user.id, billing.hourlyRate, billing.currency],
  );

  if (logo && config.databaseProvider !== "supabase") {
    await client.query(`update public.workspaces set logo_data_url = $2 where id = $1`, [
      workspaceId,
      `data:${logo.contentType};base64,${logo.bytes.toString("base64")}`,
    ]);
  } else if (logo) {
    const logoPath = workspaceLogoPath(workspaceId, logo);
    const uploaded = await getSupabaseAdmin(config)
      .storage.from("workspace-logos")
      .upload(logoPath, logo.bytes, { contentType: logo.contentType, upsert: true });
    if (uploaded.error) throw new DataApiError(500, "Could not save the workspace logo.");
    await client.query(`update public.workspaces set logo_path = $2 where id = $1`, [
      workspaceId,
      logoPath,
    ]);
  }

  if (await hasColumn(client, "user_preferences", "active_workspace_id")) {
    await client.query(
      `update public.user_preferences
          set active_workspace_id = $2, updated_at = now()
        where user_id = $1`,
      [user.id, workspaceId],
    );
  }
  return { workspaceId, account: await loadAccount(client, user, config) };
}
