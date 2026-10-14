import { DataApiError } from "../data-api-error.mjs";
import { taskDetailsValue } from "../task-actions.mjs";
import { requireWorkspaceAccess } from "./access.mjs";
import {
  dateValue,
  MAX_INTEGER_SECONDS,
  numberValue,
  optionalCurrency,
  optionalText,
  requiredText,
  timeValue,
  uuid,
} from "./validation.mjs";

export function timeEntryFromRow(row) {
  return {
    id: row.id,
    ...(row.shared_source_entry_id ? { sharedSourceEntryId: row.shared_source_entry_id } : {}),
    date: row.date,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
    ...(row.end_date !== row.date ? { endDate: row.end_date } : {}),
    ...(row.start_at ? { startTimestamp: new Date(row.start_at).getTime() } : {}),
    ...(row.end_at ? { endTimestamp: new Date(row.end_at).getTime() } : {}),
    seconds: row.duration_seconds,
    userId: row.user_id,
    projectId: row.project_id,
    task: row.task,
    ...(row.task_details ? { taskDetails: row.task_details } : {}),
    ...(row.description ? { description: row.description } : {}),
    billable: row.billable,
    ...(row.hourly_rate !== null ? { hourlyRate: numberValue(row.hourly_rate) } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
  };
}

export async function loadReportEntries(client, user, body) {
  const workspaceId = uuid(body.workspaceId);
  const startDate = dateValue(body.startDate);
  const endDate = dateValue(body.endDate);
  if (endDate < startDate) {
    throw new DataApiError(400, "The report period is invalid.");
  }

  const access = await requireWorkspaceAccess(client, user.id, workspaceId);
  const result = await client.query(
    `select id::text, date::text, start_time::text, end_time::text, end_date::text,
            start_at, end_at, duration_seconds, user_id, project_id::text, task,
            description, billable, hourly_rate, currency, task_details, shared_source_entry_id
       from public.time_entries e
      where e.workspace_id = $1
        and (
          (e.date >= $2::date and e.date <= $3::date)
          or (e.date < $2::date and e.end_date >= $2::date)
        )
        and ($4::boolean or e.user_id = $5)
      order by e.date asc, e.start_time asc, e.id asc`,
    [workspaceId, startDate, endDate, access.role !== "Member", user.id],
  );

  return result.rows.map(timeEntryFromRow);
}

export async function upsertOwnEntry(client, userId, workspaceId, entry, entryId) {
  if (typeof entry.userId !== "string" || entry.userId !== userId) {
    throw new DataApiError(403, "You can only update your own time entries.");
  }
  // Shared copies are server-owned. Ignore stale snapshots, including copies
  // already removed when the creator deleted the original interval.
  const shared = await client.query(
    `select 1 from public.task_invitations i
     where i.workspace_id=$1 and i.recipient_id=$2 and i.invited_by<>$2 and i.status='accepted'
       and (i.task_id::text=$4 or exists (
         select 1 from public.time_entries e where e.id=$3 and e.workspace_id=$1
           and e.user_id=$2 and (e.shared_source_entry_id is not null or e.task_details->>'id'=i.task_id::text)
       )) limit 1`,
    [workspaceId, userId, entryId, entry.taskDetails?.id ?? null],
  );
  if (shared.rowCount) return;
  const endDate = entry.endDate ?? entry.date;
  const seconds = Number(entry.seconds);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_INTEGER_SECONDS) {
    throw new DataApiError(400, "The data payload contains an invalid duration.");
  }
  const hourlyRate = entry.hourlyRate === undefined ? null : Number(entry.hourlyRate);
  if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
    throw new DataApiError(400, "The data payload contains an invalid hourly rate.");
  }
  let startAt = null;
  let endAt = null;
  try {
    startAt =
      typeof entry.startTimestamp === "number"
        ? new Date(entry.startTimestamp).toISOString()
        : null;
    endAt =
      typeof entry.endTimestamp === "number" ? new Date(entry.endTimestamp).toISOString() : null;
  } catch {
    throw new DataApiError(400, "The data payload contains an invalid timestamp.");
  }
  if ((startAt === null) !== (endAt === null) || (startAt && endAt && endAt <= startAt)) {
    throw new DataApiError(400, "The data payload contains an invalid time interval.");
  }
  const result = await client.query(
    `insert into public.time_entries (id, workspace_id, user_id, date, start_time, end_time, end_date, start_at, end_at, duration_seconds, project_id, task, description, billable, hourly_rate, currency, task_details)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       coalesce((select p.billable or coalesce(c.billable, false) from public.projects p
         left join public.clients c on c.id = p.client_id and c.workspace_id = p.workspace_id
         where p.id = $11 and p.workspace_id = $2), false), $14, $15, $16)
     on conflict (id) do update set date = excluded.date, start_time = excluded.start_time, end_date = excluded.end_date, end_time = excluded.end_time, start_at = excluded.start_at, end_at = excluded.end_at, duration_seconds = excluded.duration_seconds, project_id = excluded.project_id, task = excluded.task, description = excluded.description, billable = case when time_entries.project_id is not distinct from excluded.project_id then time_entries.billable else excluded.billable end, hourly_rate = excluded.hourly_rate, currency = excluded.currency, task_details = excluded.task_details, updated_at = now()
     where time_entries.workspace_id = excluded.workspace_id
       and time_entries.user_id = excluded.user_id
     returning id::text`,
    [
      entryId,
      workspaceId,
      userId,
      dateValue(entry.date),
      timeValue(entry.start),
      timeValue(entry.end),
      dateValue(endDate),
      startAt,
      endAt,
      Math.floor(seconds),
      entry.projectId ? uuid(entry.projectId) : null,
      requiredText(entry.task, "Task", 240),
      optionalText(entry.description, "Description", 10_000),
      hourlyRate,
      optionalCurrency(entry.currency),
      taskDetailsValue(entry.taskDetails),
    ],
  );
  if (!result.rowCount) {
    throw new DataApiError(403, "A time entry identifier belongs to another user or workspace.");
  }
}

export async function syncEntries(client, userId, workspaceId, entries) {
  if (!Array.isArray(entries)) throw new DataApiError(400, "Invalid time entries payload.");
  const ownEntries = entries.filter((entry) => entry?.userId === userId);
  const entryIds = ownEntries.map((entry) => uuid(entry.id));
  if (new Set(entryIds).size !== entryIds.length) {
    throw new DataApiError(400, "The data payload contains duplicate time entry identifiers.");
  }

  await client.query(
    `delete from public.time_entries
      where workspace_id = $1 and user_id = $2 and not (id = any($3::uuid[]))
        and not exists (
          select 1 from public.task_invitations i
          where i.workspace_id=$1 and i.recipient_id=$2 and i.invited_by<>$2
            and i.status='accepted' and i.task_id::text=time_entries.task_details->>'id'
        )`,
    [workspaceId, userId, entryIds],
  );

  for (const [index, entry] of ownEntries.entries()) {
    await upsertOwnEntry(client, userId, workspaceId, entry, entryIds[index]);
  }
  // Preserve replica ids and personal billing rates while copying the creator's
  // content and exact interval. Deletions cascade through the source relation.
  await client.query(
    `insert into public.time_entries
      (workspace_id,user_id,date,start_time,end_time,end_date,start_at,end_at,duration_seconds,
       project_id,task,description,billable,hourly_rate,currency,task_details,shared_source_entry_id)
     select e.workspace_id,i.recipient_id,e.date,e.start_time,e.end_time,e.end_date,e.start_at,e.end_at,
       e.duration_seconds,e.project_id,e.task,e.description,e.billable,
       coalesce(wm.hourly_rate,up.hourly_rate,0),coalesce(c.currency,wm.currency,up.currency,'USD'),e.task_details,e.id
     from public.time_entries e
     join public.task_invitations i on i.workspace_id=e.workspace_id and i.invited_by=e.user_id
       and i.task_id::text=e.task_details->>'id' and i.status='accepted'
     join public.workspace_members wm on wm.workspace_id=e.workspace_id and wm.user_id=i.recipient_id and wm.status='active'
     left join public.projects p on p.id=e.project_id and p.workspace_id=e.workspace_id
     left join public.clients c on c.id=p.client_id and c.workspace_id=e.workspace_id
     left join public.user_preferences up on up.user_id=i.recipient_id
     where e.workspace_id=$1 and e.user_id=$2 and e.shared_source_entry_id is null
     on conflict (shared_source_entry_id,user_id) do update set
       date=excluded.date,start_time=excluded.start_time,end_time=excluded.end_time,end_date=excluded.end_date,
       start_at=excluded.start_at,end_at=excluded.end_at,duration_seconds=excluded.duration_seconds,
       project_id=excluded.project_id,task=excluded.task,description=excluded.description,
       billable=excluded.billable,task_details=excluded.task_details,updated_at=now()`,
    [workspaceId, userId],
  );
}
