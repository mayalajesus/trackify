import { DataApiError } from "../data-api-error.mjs";
import { hasColumn, requireWorkspaceAccess } from "./access.mjs";
import { requiredText, uuid } from "./validation.mjs";

// Called inside a transaction. Retain the historical membership because time
// entries reference it; deleted_at ends access and prevents ordinary restoration.
export async function deleteMember(client, user, body) {
  const workspaceId = uuid(body.workspaceId);
  const memberId = requiredText(body.memberId, "Member", 200);
  await client.query("select id from public.workspaces where id = $1 for update", [workspaceId]);
  const access = await requireWorkspaceAccess(client, user.id, workspaceId);
  if (!["Owner", "Admin"].includes(access.role))
    throw new DataApiError(403, "Only Admins and the Owner can delete team memberships.");
  if (memberId === user.id)
    throw new DataApiError(403, "You cannot delete your own team membership.");
  if (!(await hasColumn(client, "workspace_members", "deleted_at")))
    throw new DataApiError(503, "Team membership deletion requires the database migration.");
  const result = await client.query(
    "select role, status, deleted_at from public.workspace_members where workspace_id = $1 and user_id = $2 for update",
    [workspaceId, memberId],
  );
  const member = result.rows[0];
  if (!member) throw new DataApiError(404, "This team member no longer exists.");
  if (member.role === "Owner" || (member.role === "Admin" && access.role !== "Owner"))
    throw new DataApiError(403, "You do not have permission to delete this team membership.");
  if (member.deleted_at) return { deletedAt: new Date(member.deleted_at).toISOString() };
  const timer = await client.query(
    "select 1 from public.active_timers where workspace_id = $1 and user_id = $2",
    [workspaceId, memberId],
  );
  if (timer.rows.length)
    throw new DataApiError(409, "Stop this member's timer before deleting their team membership.");
  const deleted = await client.query(
    "update public.workspace_members set status = 'removed', deleted_at = now() where workspace_id = $1 and user_id = $2 returning deleted_at",
    [workspaceId, memberId],
  );
  await client.query(
    "delete from public.project_members where workspace_id = $1 and user_id = $2",
    [workspaceId, memberId],
  );
  await client.query(
    "update public.clients set member_ids = array(select id from unnest(member_ids) id where id::text <> $2) where workspace_id = $1 and $2 = any(member_ids::text[])",
    [workspaceId, memberId],
  );
  return { deletedAt: new Date(deleted.rows[0].deleted_at).toISOString() };
}
