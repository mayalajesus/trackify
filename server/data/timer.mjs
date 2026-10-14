import { numberValue } from "./validation.mjs";
import { DataApiError } from "../data-api-error.mjs";

export async function timerWithOwner(client, userId, workspaceId, row) {
  const timer = timerFromRow(row);
  if (row.task_details?.id) {
    const invitation = await client.query(
      `select invited_by from public.task_invitations
       where workspace_id=$1 and task_id=$2 and recipient_id=$3 and status='accepted' limit 1`,
      [workspaceId, row.task_details.id, userId],
    );
    if (invitation.rows[0]) timer.collaborationOwnerId = invitation.rows[0].invited_by;
  }
  return timer;
}

export async function clearOwnTimer(client, userId, workspaceId) {
  await client.query("begin");
  try {
    await client.query("select id from public.workspaces where id=$1 for update", [workspaceId]);
    const result = await client.query(
      "select * from public.active_timers where user_id=$1 and workspace_id=$2 for update",
      [userId, workspaceId],
    );
    if (result.rows[0]) {
      const timer = await timerWithOwner(client, userId, workspaceId, result.rows[0]);
      if (timer.collaborationOwnerId && timer.collaborationOwnerId !== userId)
        throw new DataApiError(403, "Only the person who started this shared task can stop it.");
      const taskId = result.rows[0].task_details?.id;
      if (taskId) {
        // The owner entry is persisted before clearing the timer. Copy its exact
        // interval while preserving each participant's billing snapshot.
        const saved = await client.query(
          `with source_entry as (
             select e.* from public.time_entries e
             where e.workspace_id=$1 and e.user_id=$2 and e.task_details->>'id'=$3
               and e.created_at >= $4::timestamptz
             order by e.created_at desc, e.id desc limit 1
           ), participants as (
             select t.* from public.active_timers t
             where t.workspace_id=$1 and t.task_details->>'id'=$3 and t.user_id<>$2
               and exists (select 1 from public.task_invitations i where i.workspace_id=$1
                 and i.task_id::text=$3 and i.invited_by=$2 and i.recipient_id=t.user_id and i.status='accepted')
             for update
           )
           insert into public.time_entries
             (workspace_id,user_id,date,start_time,end_time,end_date,start_at,end_at,duration_seconds,
              project_id,task,description,billable,hourly_rate,currency,task_details,shared_source_entry_id)
           select $1,p.user_id,e.date,e.start_time,e.end_time,e.end_date,e.start_at,e.end_at,e.duration_seconds,
             e.project_id,e.task,e.description,p.billable,p.hourly_rate,p.currency,e.task_details,e.id
           from source_entry e cross join participants p
           on conflict (shared_source_entry_id,user_id) do update set
             hourly_rate=excluded.hourly_rate,currency=excluded.currency`,
          [workspaceId, userId, taskId, result.rows[0].updated_at],
        );
        const stopped = await client.query(
          `delete from public.active_timers t
           where t.workspace_id=$1 and t.task_details->>'id'=$3 and t.user_id<>$2
             and exists (select 1 from public.task_invitations i where i.workspace_id=$1
               and i.task_id::text=$3 and i.invited_by=$2 and i.recipient_id=t.user_id and i.status='accepted')`,
          [workspaceId, userId, taskId],
        );
        if (stopped.rowCount > saved.rowCount)
          throw new DataApiError(
            409,
            "Save the shared task hours before stopping its participants.",
          );
      }
      await client.query("delete from public.active_timers where user_id=$1 and workspace_id=$2", [
        userId,
        workspaceId,
      ]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

// Called within the save transaction. Lock the source before the participant so
// an in-flight save cannot recreate a timer after the owner has stopped it.
export async function requireSharedTimerSource(client, userId, workspaceId, taskId) {
  if (!taskId) return;
  const invitation = await client.query(
    `select invited_by from public.task_invitations where workspace_id=$1 and task_id=$2
     and recipient_id=$3 and status='accepted' and invited_by<>$3 limit 1`,
    [workspaceId, taskId, userId],
  );
  if (!invitation.rows[0]) return;
  const source = await client.query(
    `select user_id from public.active_timers where workspace_id=$1 and user_id=$2
     and task_details->>'id'=$3 for share`,
    [workspaceId, invitation.rows[0].invited_by, taskId],
  );
  if (!source.rows[0]) throw new DataApiError(409, "The original task timer is no longer active.");
}

export function timerFromRow(row) {
  return {
    status: row.status,
    workspaceId: row.workspace_id,
    task: row.task,
    ...(row.task_details ? { taskDetails: row.task_details } : {}),
    projectId: row.project_id,
    billable: row.billable,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    startedDate: row.started_date,
    accumulated: row.accumulated_seconds,
    startClock: row.start_clock.slice(0, 5),
    ...(row.hourly_rate !== null ? { hourlyRate: numberValue(row.hourly_rate) } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
  };
}

export async function syncSharedTimers(client, userId, workspaceId) {
  await client.query(
    `update public.active_timers p set task=s.task,project_id=s.project_id,
             task_details=s.task_details,status=s.status,started_at=s.started_at,
             started_date=s.started_date,start_clock=s.start_clock,
             accumulated_seconds=s.accumulated_seconds,billable=s.billable,updated_at=now()
           from public.active_timers s,public.task_invitations i
           where s.workspace_id=$1 and s.user_id=$2 and i.workspace_id=s.workspace_id
             and i.invited_by=s.user_id and i.task_id::text=s.task_details->>'id' and i.status='accepted'
             and p.workspace_id=s.workspace_id and p.user_id=i.recipient_id
             and p.task_details->>'id'=i.task_id::text`,
    [workspaceId, userId],
  );
}
