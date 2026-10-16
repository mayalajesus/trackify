import { DataApiError } from "./data-api-error.mjs";
import { timeEntryFromRow } from "./data/entries.mjs";

export function taskDetailsValue(value) {
  if (value == null) return null;
  if (
    typeof value !== "object" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id ?? "") ||
    typeof value.urgent !== "boolean"
  )
    throw new DataApiError(400, "Invalid task details.");
  const result = { id: value.id, urgent: value.urgent };
  if (value.description !== undefined) {
    if (typeof value.description !== "string" || value.description.length > 10_000)
      throw new DataApiError(400, "Invalid task details.");
    result.description = value.description;
  }
  if (value.trelloCard != null) {
    const card = value.trelloCard;
    if (
      typeof card.id !== "string" ||
      !/^(?:[a-f0-9]{24}|[a-z0-9]{8})$/i.test(card.id) ||
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
  if (body.operation === "listTaskInvitationResponses") {
    const result = await client.query(
      `select i.id::text,i.task,i.status,p.name as "recipientName"
       from public.task_invitations i join public.profiles p on p.id=i.recipient_id
       where i.workspace_id=$1 and i.invited_by=$2
       order by i.created_at desc,i.id desc limit 200`,
      [workspaceId, user.id],
    );
    return result.rows;
  }
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
    // Serialize acceptance with the owner's stop operation before locking the invitation.
    await client.query("select id from public.workspaces where id=$1 for update", [workspaceId]);
    const found = await client.query(
      `select * from public.task_invitations where id=$1 and workspace_id=$2 and recipient_id=$3 and status='pending' and expires_at>now() for update`,
      [uuid(body.invitationId), workspaceId, user.id],
    );
    const invitation = found.rows[0];
    if (!invitation) throw new DataApiError(409, "This task invitation is no longer available.");
    let acceptedTimer = null;
    let acceptedEntries = [];
    if (body.response === "accepted") {
      await requireWorkspaceAccess(client, invitation.invited_by, workspaceId);
      const source = await client.query(
        `select * from public.active_timers
         where workspace_id=$1 and user_id=$2 and task_details->>'id'=$3
         for update`,
        [workspaceId, invitation.invited_by, String(invitation.task_id)],
      );
      const sourceTimer = source.rows[0];
      if (!sourceTimer) {
        const saved = await client.query(
          `insert into public.time_entries
            (workspace_id,user_id,date,start_time,end_time,end_date,start_at,end_at,duration_seconds,
             project_id,task,description,billable,hourly_rate,currency,task_details,shared_source_entry_id)
           select e.workspace_id,$3,e.date,e.start_time,e.end_time,e.end_date,e.start_at,e.end_at,e.duration_seconds,
             e.project_id,e.task,e.description,e.billable,
             coalesce(wm.hourly_rate,up.hourly_rate,0),
             coalesce(c.currency,wm.currency,up.currency,'USD'),e.task_details,e.id
           from public.time_entries e
           join public.workspace_members wm on wm.workspace_id=e.workspace_id and wm.user_id=$3 and wm.status='active'
           left join public.projects p on p.id=e.project_id and p.workspace_id=e.workspace_id
           left join public.clients c on c.id=p.client_id and c.workspace_id=e.workspace_id
           left join public.user_preferences up on up.user_id=$3
           where e.workspace_id=$1 and e.user_id=$2 and e.task_details->>'id'=$4
           returning *, id::text,date::text,start_time::text,end_time::text,end_date::text,project_id::text`,
          [workspaceId, invitation.invited_by, user.id, String(invitation.task_id)],
        );
        if (!saved.rowCount)
          throw new DataApiError(409, "The original task timer is no longer active.");
        acceptedEntries = saved.rows.map(timeEntryFromRow);
      } else {
        await requireProject(client, workspaceId, sourceTimer.project_id, user.id);
        const started = await client.query(
          `insert into public.active_timers
          (user_id, workspace_id, status, task, project_id, billable, started_at,
           started_date, accumulated_seconds, start_clock, hourly_rate, currency, task_details)
         select $1, $2, $6, $3, p.id,
           p.billable or coalesce(c.billable, false), $7::timestamptz,
           $8::date, $9::integer, $10::time,
           coalesce(wm.hourly_rate, up.hourly_rate, 0),
           coalesce(c.currency, wm.currency, up.currency, 'USD'), $5
         from public.projects p
         join public.workspace_members wm on wm.workspace_id=p.workspace_id and wm.user_id=$1
         left join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
         left join public.user_preferences up on up.user_id=$1
         where p.id=$4 and p.workspace_id=$2
         on conflict (user_id, workspace_id) do nothing
         returning *, workspace_id::text, project_id::text, started_date::text, start_clock::text`,
          [
            user.id,
            workspaceId,
            sourceTimer.task,
            sourceTimer.project_id,
            sourceTimer.task_details,
            sourceTimer.status,
            sourceTimer.started_at,
            sourceTimer.started_date,
            sourceTimer.accumulated_seconds,
            sourceTimer.start_clock,
          ],
        );
        if (!started.rowCount)
          throw new DataApiError(409, "Stop the active timer before accepting a task invitation.");
        acceptedTimer = {
          ...timerFromRow(started.rows[0]),
          collaborationOwnerId: invitation.invited_by,
        };
      }
    }
    await client.query("update public.task_invitations set status=$2 where id=$1", [
      invitation.id,
      body.response,
    ]);
    await client.query("commit");
    return {
      timer: acceptedTimer,
      entries: acceptedEntries,
      task: invitation.task,
      projectId: invitation.project_id,
      taskDetails: invitation.task_details,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
