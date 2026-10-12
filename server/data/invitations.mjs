import { randomUUID } from "node:crypto";
import { DataApiError } from "../data-api-error.mjs";
import { deliverInvitation, queueEmail } from "../transactional-emails.mjs";
import { hasColumn, requireInvitationManager } from "./access.mjs";
import { ensureProfile } from "./profile.mjs";
import { iso, numberValue, uuid } from "./validation.mjs";

export function invitationMember(row) {
  const name = String(row.email ?? "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return {
    id: row.id,
    name: name || "Invited user",
    email: row.email,
    initials,
    role: row.role,
    status: "invited",
    invitedAt: iso(row.invited_at),
  };
}

export function invitationRedirect(config, invitationId) {
  if (!config.appUrl)
    throw new DataApiError(500, "APP_URL is required to create invitation links.");
  let redirect;
  try {
    redirect = new URL("/invite/accept", config.appUrl);
  } catch {
    throw new DataApiError(500, "APP_URL is invalid.");
  }
  redirect.searchParams.set("invitation", invitationId);
  return redirect.toString();
}

export async function invitationEmail(client, user, config, body, invitation) {
  const workspace = await client.query("select name from public.workspaces where id=$1", [
    invitation.workspace_id,
  ]);
  return await queueEmail(client, {
    key: body.emailOperationKey,
    kind: "invitation",
    userId: user.id,
    invitationId: invitation.id,
    recipient: invitation.email,
    payload: {
      workspace: workspace.rows[0].name,
      inviter: user.name || user.email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
      url: invitationRedirect(config, invitation.id),
    },
  });
}

export async function processInvitationEmail(client, user, config, body, resend) {
  const workspaceId = uuid(body.workspaceId);
  const requestId = body.emailRequestId ? uuid(body.emailRequestId) : randomUUID();
  const emailOperationKey = `invitation:${user.id}:${workspaceId}:${resend ? "resend" : "create"}:${requestId}`;
  let result;
  await client.query("begin");
  try {
    await requireInvitationManager(client, user.id, workspaceId, "Member");
    await client.query("select id from public.workspaces where id=$1 for update", [workspaceId]);
    const previous = await client.query(
      `select e.id as email_id, i.id::text, i.workspace_id::text, i.email, i.role, i.invited_at, i.expires_at, i.status
      from public.transactional_emails e join public.workspace_invitations i on i.id=e.invitation_id where e.operation_key=$1`,
      [emailOperationKey],
    );
    if (previous.rows[0]) {
      const invitation = previous.rows[0];
      await requireInvitationManager(client, user.id, workspaceId, invitation.role);
      if (invitation.status !== "pending" || new Date(invitation.expires_at) <= new Date())
        throw new DataApiError(409, "This invitation is no longer pending.");
      result = {
        member: invitationMember(invitation),
        invitationUrl: invitationRedirect(config, invitation.id),
        emailId: invitation.email_id,
      };
    } else {
      result = await (resend ? resendInvitation : inviteMember)(client, user, config, {
        ...body,
        emailOperationKey,
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  const { emailId, ...invitation } = result;
  return { ...invitation, emailStatus: await deliverInvitation(client, config, emailId) };
}

export async function inviteMember(client, user, config, body) {
  await ensureProfile(client, user, config);
  const workspaceId = uuid(body.workspaceId);
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const role = body.role === "Admin" ? "Admin" : body.role === "Member" ? "Member" : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) {
    throw new DataApiError(400, "Enter a valid invitation email and role.");
  }
  await requireInvitationManager(client, user.id, workspaceId, role);
  const existing = await client.query(
    `select 1
       from public.workspace_members wm
       join public.profiles p on p.id = wm.user_id
      where wm.workspace_id = $1 and lower(p.email) = $2
      limit 1`,
    [workspaceId, email],
  );
  if (existing.rowCount) {
    throw new DataApiError(409, "This email is already part of the team.");
  }
  await client.query(
    `update public.workspace_invitations
        set status = 'expired'
      where workspace_id = $1 and lower(email) = $2
        and status = 'pending' and expires_at <= now()`,
    [workspaceId, email],
  );
  const capacity = await client.query(
    `select
       (select count(*) from public.workspace_members where workspace_id = $1 and status <> 'removed')
       +
       (select count(*) from public.workspace_invitations where workspace_id = $1 and status = 'pending' and expires_at > now())
       as total`,
    [workspaceId],
  );
  if (numberValue(capacity.rows[0]?.total) >= 50) {
    throw new DataApiError(
      409,
      "This workspace has reached its limit of 50 members and invitations.",
    );
  }
  let inserted;
  try {
    inserted = await client.query(
      `insert into public.workspace_invitations (workspace_id, email, role, invited_by)
       values ($1, $2, $3, $4)
       returning id::text, workspace_id::text, email, role, invited_at, expires_at`,
      [workspaceId, email, role, user.id],
    );
  } catch (error) {
    if (error?.code === "23505") {
      throw new DataApiError(409, "This email already has a pending invitation.");
    }
    throw error;
  }
  const invitation = inserted.rows[0];
  return {
    member: invitationMember(invitation),
    invitationUrl: invitationRedirect(config, invitation.id),
    emailId: await invitationEmail(client, user, config, body, invitation),
  };
}

export async function resendInvitation(client, user, config, body) {
  const workspaceId = uuid(body.workspaceId);
  const invitationId = uuid(body.invitationId);
  const result = await client.query(
    `select id::text, workspace_id::text, email, role, invited_at, expires_at
       from public.workspace_invitations
      where id = $1 and workspace_id = $2 and status = 'pending' and expires_at > now()`,
    [invitationId, workspaceId],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new DataApiError(404, "This invitation is no longer pending.");
  await requireInvitationManager(client, user.id, workspaceId, invitation.role);
  const updated = await client.query(
    `update public.workspace_invitations
        set invited_at = now(), expires_at = now() + interval '7 days'
      where id = $1
      returning id::text, workspace_id::text, email, role, invited_at, expires_at`,
    [invitationId],
  );
  return {
    member: invitationMember(updated.rows[0]),
    invitationUrl: invitationRedirect(config, invitationId),
    emailId: await invitationEmail(client, user, config, body, updated.rows[0]),
  };
}

export async function cancelInvitation(client, user, body) {
  const workspaceId = uuid(body.workspaceId);
  const invitationId = uuid(body.invitationId);
  const result = await client.query(
    `select id::text, role
       from public.workspace_invitations
      where id = $1 and workspace_id = $2 and status = 'pending'`,
    [invitationId, workspaceId],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new DataApiError(404, "This invitation is no longer pending.");
  await requireInvitationManager(client, user.id, workspaceId, invitation.role);
  await client.query(`update public.workspace_invitations set status = 'cancelled' where id = $1`, [
    invitationId,
  ]);
  return null;
}

export async function acceptInvitation(client, user, config, body) {
  const invitationId = uuid(body.invitationId);
  await ensureProfile(client, user, config);
  const result = await client.query(
    `select invitation.id::text, invitation.workspace_id::text, invitation.email,
            invitation.role, invitation.status, invitation.invited_at, invitation.expires_at,
            invitation.auth_user_id, workspace.status as workspace_status
       from public.workspace_invitations invitation
       join public.workspaces workspace on workspace.id = invitation.workspace_id
      where invitation.id = $1
      for update of invitation`,
    [invitationId],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new DataApiError(404, "This invitation no longer exists.");
  if (invitation.workspace_status === "archived") {
    throw new DataApiError(409, "This workspace is archived.");
  }
  if (String(invitation.email).trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    throw new DataApiError(403, "This invitation belongs to a different email address.");
  }
  const existing = await client.query(
    `select 1 from public.workspace_members
      where workspace_id = $1 and user_id = $2 and status = 'active'`,
    [invitation.workspace_id, user.id],
  );
  if (
    invitation.status === "accepted" &&
    invitation.auth_user_id === user.id &&
    existing.rowCount
  ) {
    if (await hasColumn(client, "user_preferences", "active_workspace_id")) {
      await client.query(
        `update public.user_preferences
            set active_workspace_id = $2, updated_at = now()
          where user_id = $1`,
        [user.id, invitation.workspace_id],
      );
    }
    return { workspaceId: invitation.workspace_id };
  }
  if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
    throw new DataApiError(409, "This invitation is no longer valid.");
  }
  if (existing.rowCount) throw new DataApiError(409, "You already have access to this workspace.");

  await client.query(
    `insert into public.workspace_members (
       workspace_id, user_id, role, status, invited_at, joined_at
     ) values ($1, $2, $3, 'active', $4, now())
     on conflict (workspace_id, user_id) do update set
       role = excluded.role,
       status = 'active',
       invited_at = excluded.invited_at,
       joined_at = excluded.joined_at`,
    [invitation.workspace_id, user.id, invitation.role, invitation.invited_at],
  );
  await client.query(
    `update public.workspace_invitations
        set status = 'accepted', auth_user_id = $2, accepted_at = now()
      where id = $1`,
    [invitationId, user.id],
  );
  if (await hasColumn(client, "user_preferences", "active_workspace_id")) {
    await client.query(
      `update public.user_preferences set active_workspace_id = $2, updated_at = now() where user_id = $1`,
      [user.id, invitation.workspace_id],
    );
  }
  return { workspaceId: invitation.workspace_id };
}
