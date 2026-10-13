import { DataApiError } from "./data-api-error.mjs";

export function taskDetailsValue(value) {
  if (value == null) return null;
  if (
    typeof value !== "object" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id ?? "") ||
    typeof value.urgent !== "boolean"
  )
    throw new DataApiError(400, "Invalid task details.");
  const result = { id: value.id, urgent: value.urgent };
  if (value.trelloCard != null) {
    const card = value.trelloCard;
    if (
      typeof card.id !== "string" ||
      !/^[a-f0-9]{24}$/i.test(card.id) ||
      typeof card.name !== "string" ||
      card.name.length > 1000 ||
      typeof card.board !== "string" ||
      card.board.length > 1000 ||
      typeof card.url !== "string" ||
      !/^https:\/\/trello\.com\/c\/[a-zA-Z0-9]+(?:\/[^\s]*)?$/.test(card.url)
    )
      throw new DataApiError(400, "Invalid Trello card.");
    result.trelloCard = { id: card.id, name: card.name, board: card.board, url: card.url };
  }
  return result;
}

async function requireProject(client, workspaceId, projectId, userId) {
  const result = await client.query(
    `select p.id from public.projects p
    join public.workspace_members m on m.workspace_id=p.workspace_id and m.user_id=$3 and m.status='active'
    where p.id=$2 and p.workspace_id=$1 and p.status='active'`,
    [workspaceId, projectId, userId],
  );
  if (!result.rowCount)
    throw new DataApiError(403, "This project is not available to the selected member.");
}

export async function handleTaskAction(
  client,
  user,
  body,
  { requireWorkspaceAccess, uuid, timerFromRow },
) {
  const workspaceId = uuid(body.workspaceId);
  await requireWorkspaceAccess(client, user.id, workspaceId);
  if (body.operation === "listTaskParticipants") {
    const result = await client.query(
      `with visible_tasks as (
        select distinct task_id from public.task_invitations
        where workspace_id=$1 and (invited_by=$2 or (recipient_id=$2 and status='accepted'))
      ), participants as (
        select i.task_id, i.invited_by as user_id from public.task_invitations i
        join visible_tasks v on v.task_id=i.task_id where i.workspace_id=$1
        union
        select i.task_id, i.recipient_id from public.task_invitations i
        join visible_tasks v on v.task_id=i.task_id where i.workspace_id=$1 and i.status='accepted'
      ) select p.task_id::text as "taskId", p.user_id as "userId"
        from participants p join public.workspace_members m on m.workspace_id=$1 and m.user_id=p.user_id and m.status='active'`,
      [workspaceId, user.id],
    );
    return result.rows;
  }
  if (body.operation === "listTaskInvitations") {
    const result = await client.query(
      `select i.id::text,i.task,i.project_id::text as "projectId",i.task_details as "taskDetails",p.name as "senderName"
      from public.task_invitations i join public.profiles p on p.id=i.invited_by
      join public.workspace_members m on m.workspace_id=i.workspace_id and m.user_id=i.invited_by and m.status='active'
      where i.workspace_id=$1 and i.recipient_id=$2 and i.status='pending' and i.expires_at>now()
      order by i.created_at limit 50`,
      [workspaceId, user.id],
    );
    return result.rows;
  }
  if (body.operation === "inviteToTask") {
    const projectId = uuid(body.projectId),
      details = taskDetailsValue(body.taskDetails);
    const task = typeof body.task === "string" ? body.task.trim() : "";
    if (
      !details ||
      !task ||
      task.length > 240 ||
      !Array.isArray(body.memberIds) ||
      body.memberIds.length < 1 ||
      body.memberIds.length > 50 ||
      body.memberIds.some((id) => typeof id !== "string")
    )
      throw new DataApiError(400, "Choose a task, project and team members.");
    const members = [...new Set(body.memberIds)].filter((id) => id !== user.id);
    await client.query("begin");
    try {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `${workspaceId}:${details.id}`,
      ]);
      await requireProject(client, workspaceId, projectId, user.id);
      // A task identifier cannot be reused to impersonate another sender.
      const existing = await client.query(
        "select invited_by from public.task_invitations where workspace_id=$1 and task_id=$2 limit 1",
        [workspaceId, details.id],
      );
      if (existing.rowCount && existing.rows[0].invited_by !== user.id)
        throw new DataApiError(403, "Only the task inviter can invite more members.");
      for (const memberId of members) {
        await requireProject(client, workspaceId, projectId, memberId);
        await client.query(
          `insert into public.task_invitations(workspace_id,task_id,invited_by,recipient_id,project_id,task,task_details)
          values($1,$2,$3,$4,$5,$6,$7) on conflict(workspace_id,task_id,recipient_id) do nothing`,
          [workspaceId, details.id, user.id, memberId, projectId, task, details],
        );
      }
      await client.query("commit");
      return null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  if (!["accepted", "declined"].includes(body.response))
    throw new DataApiError(400, "Choose a valid invitation response.");
  await client.query("begin");
  try {
    const found = await client.query(
      `select * from public.task_invitations where id=$1 and workspace_id=$2 and recipient_id=$3 and status='pending' and expires_at>now() for update`,
      [uuid(body.invitationId), workspaceId, user.id],
    );
    const invitation = found.rows[0];
    if (!invitation) throw new DataApiError(409, "This task invitation is no longer available.");
    let acceptedTimer = null;
    if (body.response === "accepted") {
      await requireProject(client, workspaceId, invitation.project_id, user.id);
      await requireWorkspaceAccess(client, invitation.invited_by, workspaceId);
      const started = await client.query(
        `insert into public.active_timers
          (user_id, workspace_id, status, task, project_id, billable, started_at,
           started_date, accumulated_seconds, start_clock, hourly_rate, currency, task_details)
         select $1, $2, 'running', $3, p.id,
           p.billable or coalesce(c.billable, false), now(),
           (now() at time zone coalesce(up.timezone, 'UTC'))::date, 0,
           (now() at time zone coalesce(up.timezone, 'UTC'))::time,
           coalesce(wm.hourly_rate, up.hourly_rate, 0),
           coalesce(c.currency, wm.currency, up.currency, 'USD'), $5
         from public.projects p
         join public.workspace_members wm on wm.workspace_id=p.workspace_id and wm.user_id=$1
         left join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
         left join public.user_preferences up on up.user_id=$1
         where p.id=$4 and p.workspace_id=$2
         on conflict (user_id, workspace_id) do nothing
         returning *, workspace_id::text, project_id::text, started_date::text, start_clock::text`,
        [user.id, workspaceId, invitation.task, invitation.project_id, invitation.task_details],
      );
      if (!started.rowCount)
        throw new DataApiError(409, "Stop the active timer before accepting a task invitation.");
      acceptedTimer = timerFromRow(started.rows[0]);
    }
    await client.query("update public.task_invitations set status=$2 where id=$1", [
      invitation.id,
      body.response,
    ]);
    await client.query("commit");
    return {
      timer: acceptedTimer,
      task: invitation.task,
      projectId: invitation.project_id,
      taskDetails: invitation.task_details,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
