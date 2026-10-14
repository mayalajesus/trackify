import { DataApiError } from "../data-api-error.mjs";
import { requireWorkspaceAccess } from "./access.mjs";
import { uuid } from "./validation.mjs";

// Called inside the HTTP operation's transaction. The workspace lock also
// serializes timer writes and account synchronization with deletion.
export async function deleteWorkspace(client, user, body) {
  const workspaceId = uuid(body.workspaceId);
  const workspace = await client.query(
    "select name, owner_id from public.workspaces where id = $1 for update",
    [workspaceId],
  );
  const access = await requireWorkspaceAccess(client, user.id, workspaceId, true);
  if (access.role !== "Owner" || workspace.rows[0]?.owner_id !== user.id)
    throw new DataApiError(403, "Only the workspace Owner can delete it.");
  if (typeof body.confirmation !== "string" || body.confirmation !== workspace.rows[0].name)
    throw new DataApiError(400, "Enter the workspace name to confirm deletion.");
  const timers = await client.query(
    "select 1 from public.active_timers where workspace_id = $1 and status <> 'idle' limit 1",
    [workspaceId],
  );
  if (timers.rows.length)
    throw new DataApiError(409, "Stop all timers in this workspace before deleting it.");
  // Remove dependents before their restricted project/client foreign keys.
  await client.query("delete from public.time_entries where workspace_id = $1", [workspaceId]);
  await client.query("delete from public.projects where workspace_id = $1", [workspaceId]);
  await client.query("delete from public.clients where workspace_id = $1", [workspaceId]);
  await client.query("delete from public.workspaces where id = $1", [workspaceId]);
  return null;
}
