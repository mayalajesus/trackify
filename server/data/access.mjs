import { DataApiError } from "../data-api-error.mjs";

export async function hasColumn(client, tableName, columnName) {
  const result = await client.query(
    `select exists (
       select 1
         from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2
     ) as present`,
    [tableName, columnName],
  );
  return Boolean(result.rows[0]?.present);
}

export async function workspaceAccess(client, userId, workspaceId) {
  const result = await client.query(
    `select w.status, w.owner_id, wm.role, wm.status as membership_status
       from public.workspace_members wm
       join public.workspaces w on w.id = wm.workspace_id
      where wm.workspace_id = $1 and wm.user_id = $2
      limit 1`,
    [workspaceId, userId],
  );
  return result.rows[0] ?? null;
}

export async function requireWorkspaceAccess(client, userId, workspaceId, allowArchived = false) {
  const access = await workspaceAccess(client, userId, workspaceId);
  if (!access || access.membership_status !== "active") {
    throw new DataApiError(403, "You do not have access to this workspace.");
  }
  if (!allowArchived && access.status !== "active") {
    throw new DataApiError(403, "Archived workspaces are read-only.");
  }
  return access;
}

export function requirePayloadUser(user, body) {
  if (body.userId !== undefined && body.userId !== user.id) {
    throw new DataApiError(403, "The authenticated user does not match the request.");
  }
}

export async function requireInvitationManager(client, userId, workspaceId, targetRole) {
  const access = await requireWorkspaceAccess(client, userId, workspaceId);
  if (access.role !== "Owner" && access.role !== "Admin") {
    throw new DataApiError(403, "You do not have permission to manage invitations.");
  }
  if (targetRole === "Admin" && access.role !== "Owner") {
    throw new DataApiError(403, "Only the Owner can manage Admin invitations.");
  }
  return access;
}
