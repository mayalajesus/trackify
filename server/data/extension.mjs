import { DataApiError } from "../data-api-error.mjs";
import { requireWorkspaceAccess } from "./access.mjs";
import { uuid, requiredText, MAX_INTEGER_SECONDS } from "./validation.mjs";
import { timerWithOwner, syncSharedTimers, clearOwnTimer } from "./timer.mjs";

const timerQuery = `select t.*,t.workspace_id::text,t.project_id::text,
  t.started_date::text,t.start_clock::text,t.updated_at::text as version
  from public.active_timers t where t.user_id=$1 and t.workspace_id=$2`;

export function extensionCard(value) {
  if (!value || typeof value.url !== "string") throw new DataApiError(400, "Cartão inválido.");
  let url;
  try {
    url = new URL(value.url);
  } catch {
    throw new DataApiError(400, "Cartão inválido.");
  }
  const match = /^\/c\/([A-Za-z0-9]{8})(?:\/|$)/.exec(url.pathname);
  if (url.origin !== "https://trello.com" || url.username || url.password || !match)
    throw new DataApiError(400, "Abra um cartão válido no Trello.");
  return {
    id: match[1],
    name: requiredText(value.title, "Task", 240),
    url: `https://trello.com/c/${match[1]}`,
    board: typeof value.board === "string" ? value.board.slice(0, 1000) : "",
  };
}

export function extensionElapsed(row, now) {
  const seconds =
    Number(row.accumulated_seconds) +
    (row.status === "running"
      ? Math.max(0, Math.floor((now - new Date(row.started_at).getTime()) / 1000))
      : 0);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_INTEGER_SECONDS)
    throw new DataApiError(409, "Revise a duração deste cronômetro no Trackify.");
  return seconds;
}

async function publicTimer(client, userId, workspaceId, row) {
  return row
    ? { ...(await timerWithOwner(client, userId, workspaceId, row)), version: row.version }
    : null;
}

export async function extensionContext(client, user, body) {
  const workspaces = await client.query(
    `select w.id::text,w.name from public.workspaces w
    join public.workspace_members m on m.workspace_id=w.id
    where m.user_id=$1 and m.status='active' and w.status='active' order by lower(w.name),w.id`,
    [user.id],
  );
  const workspaceId = body.workspaceId ? uuid(body.workspaceId) : workspaces.rows[0]?.id;
  if (!workspaceId) return { workspaces: [], projects: [], timer: null, workspaceId: null };
  await requireWorkspaceAccess(client, user.id, workspaceId);
  const projects = await client.query(
    `select p.id::text,p.name,c.name as "clientName",c.color as "clientColor"
    from public.projects p join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
    where p.workspace_id=$1 and p.status='active' order by lower(c.name),lower(p.name),p.id`,
    [workspaceId],
  );
  const timer = await client.query(timerQuery, [user.id, workspaceId]);
  return {
    workspaces: workspaces.rows,
    projects: projects.rows,
    workspaceId,
    timer: await publicTimer(client, user.id, workspaceId, timer.rows[0]),
  };
}

export async function extensionTimerAction(client, user, body) {
  const workspaceId = uuid(body.workspaceId);
  if (!["start", "pause", "resume", "stop"].includes(body.action))
    throw new DataApiError(400, "Ação inválida.");
  await client.query("begin");
  try {
    // Same workspace lock order as the app/shared timer paths.
    await client.query("select id from public.workspaces where id=$1 for update", [workspaceId]);
    await requireWorkspaceAccess(client, user.id, workspaceId);
    const current = await client.query(`${timerQuery} for update`, [user.id, workspaceId]);
    let row = current.rows[0];
    if (body.action === "start") {
      const taskId = uuid(body.taskId),
        projectId = uuid(body.projectId),
        card = extensionCard(body.card);
      // Retries of an already saved start must never create another interval.
      const completed = await client.query(
        `select id from public.time_entries
        where workspace_id=$1 and user_id=$2 and task_details->>'id'=$3`,
        [workspaceId, user.id, taskId],
      );
      if (completed.rowCount)
        throw new DataApiError(409, "Este registro já foi concluído. Atualize o painel.");
      if (row && row.task_details?.id !== taskId)
        throw new DataApiError(
          409,
          "Já existe um cronômetro neste workspace. Finalize-o primeiro.",
        );
      if (!row) {
        const project = await client.query(
          `select p.id,p.billable or coalesce(c.billable,false) as billable,
          m.hourly_rate,m.currency,coalesce(u.timezone,'UTC') as timezone
          from public.projects p join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
          join public.workspace_members m on m.workspace_id=p.workspace_id and m.user_id=$3 and m.status='active'
          left join public.user_preferences u on u.user_id=m.user_id
          where p.workspace_id=$1 and p.id=$2 and p.status='active'`,
          [workspaceId, projectId, user.id],
        );
        const p = project.rows[0];
        if (!p) throw new DataApiError(403, "Projeto indisponível neste workspace.");
        await client.query(
          `insert into public.active_timers
          (user_id,workspace_id,status,task,project_id,billable,started_at,started_date,start_clock,
           accumulated_seconds,hourly_rate,currency,task_details)
          values ($1,$2,'running',$3,$4,$5,clock_timestamp(),
           (clock_timestamp() at time zone $6)::date,(clock_timestamp() at time zone $6)::time,0,$7,$8,$9)`,
          [
            user.id,
            workspaceId,
            card.name,
            projectId,
            p.billable,
            p.timezone,
            p.hourly_rate,
            p.currency,
            { id: taskId, urgent: false, trelloCard: card },
          ],
        );
      }
    } else if (row) {
      const timer = await timerWithOwner(client, user.id, workspaceId, row);
      if (timer.collaborationOwnerId && timer.collaborationOwnerId !== user.id)
        throw new DataApiError(403, "Somente quem iniciou a tarefa em conjunto pode controlá-la.");
      if (body.version !== row.version)
        throw new DataApiError(409, "O cronômetro mudou. Atualize o painel antes de continuar.");
      const seconds = extensionElapsed(row, Date.now());
      if (body.action === "stop") {
        if (seconds < 1) throw new DataApiError(409, "Aguarde um segundo antes de finalizar.");
        // Existing paused timers keep their original start clock. PostgreSQL applies the user's timezone.
        await client.query(
          `insert into public.time_entries
          (id,workspace_id,user_id,date,start_time,end_time,end_date,start_at,end_at,duration_seconds,
           project_id,task,description,billable,hourly_rate,currency,task_details)
          select gen_random_uuid(),t.workspace_id,t.user_id,
            t.started_date,t.start_clock,(v.finish at time zone v.zone)::time,
            (v.finish at time zone v.zone)::date,v.beginning,v.finish,$3,t.project_id,t.task,
            coalesce(t.task_details->>'description',''),t.billable,t.hourly_rate,t.currency,t.task_details
          from public.active_timers t left join public.user_preferences u on u.user_id=t.user_id
          cross join lateral (select coalesce(u.timezone,'UTC') as zone,
            (t.started_date+t.start_clock) at time zone coalesce(u.timezone,'UTC') as beginning,
            ((t.started_date+t.start_clock) at time zone coalesce(u.timezone,'UTC')) + $3 * interval '1 second' as finish) v
          where t.workspace_id=$1 and t.user_id=$2`,
          [workspaceId, user.id, seconds],
        );
        await clearOwnTimer(client, user.id, workspaceId, false);
      } else if (
        (body.action === "pause" && row.status === "running") ||
        (body.action === "resume" && row.status === "paused")
      ) {
        await client.query(
          `update public.active_timers set status=$3,accumulated_seconds=$4,
          started_at=case when $3='running' then clock_timestamp() else null end,updated_at=clock_timestamp()
          where user_id=$1 and workspace_id=$2`,
          [user.id, workspaceId, body.action === "pause" ? "paused" : "running", seconds],
        );
        await syncSharedTimers(client, user.id, workspaceId);
      }
    } else if (body.action !== "stop") {
      throw new DataApiError(409, "Não há cronômetro ativo. Atualize o painel.");
    }
    row = (await client.query(timerQuery, [user.id, workspaceId])).rows[0];
    const result = { timer: await publicTimer(client, user.id, workspaceId, row) };
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
