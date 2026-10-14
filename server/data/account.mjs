import { hasColumn } from "./access.mjs";
import { timeEntryFromRow } from "./entries.mjs";
import { invitationMember } from "./invitations.mjs";
import { ensureProfile } from "./profile.mjs";
import { signedStorageUrl } from "./storage.mjs";
import {
  avatarDataValue,
  defaultAvatarForUser,
  favoriteTasksValue,
  iso,
  numberValue,
  reportFiltersValue,
} from "./validation.mjs";

export function emptyTrello() {
  return {
    status: "disconnected",
    workspace: null,
    board: null,
    lists: [],
    cards: [],
    rule: "lists",
    lastSync: null,
  };
}

export async function loadAccount(client, user, config) {
  await ensureProfile(client, user, config);
  const hasLogoPath = await hasColumn(client, "workspaces", "logo_path");
  const hasLogoData = await hasColumn(client, "workspaces", "logo_data_url");
  const hasActiveWorkspace = await hasColumn(client, "user_preferences", "active_workspace_id");
  const hasReportFilters = await hasColumn(client, "user_preferences", "report_filters");
  const workspaces = await client.query(
    `select w.id::text, w.name, w.owner_id, w.status, w.created_at, w.archived_at,
            ${hasLogoPath ? "w.logo_path" : "null::text as logo_path"},
            ${hasLogoData ? "w.logo_data_url" : "null::text as logo_data_url"}
       from public.workspaces w
       join public.workspace_members access on access.workspace_id = w.id
      where access.user_id = $1 and access.status = 'active'
      order by w.created_at asc`,
    [user.id],
  );
  const workspaceIds = workspaces.rows.map((row) => row.id);
  const identityRows = await client.query(
    `select distinct p.id, p.name, p.email, p.initials, p.avatar_path
       from public.profiles p
      where p.id = $2
         or exists (
           select 1
             from public.workspace_members wm
            where wm.user_id = p.id
              and wm.workspace_id = any($1::uuid[])
         )`,
    [workspaceIds, user.id],
  );
  const invitations = await client.query(
    `select id::text, workspace_id::text, email, role, invited_at, expires_at
       from public.workspace_invitations
      where workspace_id = any($1::uuid[])
        and status = 'pending'
        and expires_at > now()
        and exists (
          select 1
            from public.workspace_members actor
           where actor.workspace_id = workspace_invitations.workspace_id
             and actor.user_id = $2
             and actor.status = 'active'
             and actor.role in ('Owner', 'Admin')
        )
      order by invited_at desc`,
    [workspaceIds, user.id],
  );
  const identityById = new Map(identityRows.rows.map((row) => [row.id, row]));
  for (const row of invitations.rows) {
    const pending = invitationMember(row);
    identityById.set(pending.id, pending);
  }
  const identities = [...identityById.values()].map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    initials: row.initials,
  }));
  const profileIds = identityRows.rows.map((identity) => identity.id);
  const memberships = await client.query(
    `select workspace_id::text, user_id, role, status, hourly_rate, currency, invited_at, joined_at, to_jsonb(workspace_members)->>'deleted_at' as deleted_at
     from public.workspace_members where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const settings = await client.query(
    `select workspace_id::text, week_start from public.workspace_settings where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const clients = await client.query(
    `select id::text, workspace_id::text, name, contact, billable, currency, contracted_hours, status, member_ids from public.clients where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const projects = await client.query(
    `select id::text, workspace_id::text, name, client_id::text, billable, status, color, last_activity::text from public.projects where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const projectMembers = await client.query(
    `select project_id::text, user_id from public.project_members where workspace_id = any($1::uuid[])`,
    [workspaceIds],
  );
  const entries = await client.query(
    `select id::text, workspace_id::text, date::text, start_time::text, end_time::text, end_date::text, start_at, end_at, duration_seconds, user_id, project_id::text, task, description, billable, hourly_rate, currency, task_details, shared_source_entry_id
       from public.time_entries e
      where e.workspace_id = any($1::uuid[])
        and (
          e.user_id = $2
          or exists (
            select 1
              from public.workspace_members viewer
             where viewer.workspace_id = e.workspace_id
               and viewer.user_id = $2
               and viewer.status = 'active'
               and viewer.role in ('Admin', 'Owner')
          )
        )
      order by date asc, start_time asc`,
    [workspaceIds, user.id],
  );
  const hasAvatarData = await hasColumn(client, "user_preferences", "avatar_data_url");
  if (hasAvatarData) {
    for (const id of profileIds) {
      await client.query(
        `insert into public.user_preferences (user_id, avatar_data_url)
         values ($1, $2)
         on conflict (user_id) do update
           set avatar_data_url = coalesce(nullif(public.user_preferences.avatar_data_url, ''), excluded.avatar_data_url),
               updated_at = now()`,
        [id, defaultAvatarForUser(id)],
      );
    }
  }
  const preferences = await client.query(
    `select user_id, language, theme, timezone, ${
      hasAvatarData ? "avatar_data_url" : "null::text as avatar_data_url"
    }, ${hasActiveWorkspace ? "active_workspace_id::text" : "null::text as active_workspace_id"},
       ${hasReportFilters ? "report_filters" : "'{}'::jsonb as report_filters"},
       ${(await hasColumn(client, "user_preferences", "favorite_tasks")) ? "favorite_tasks" : "'{}'::jsonb as favorite_tasks"}
       from public.user_preferences where user_id = any($1::text[])`,
    [profileIds],
  );
  const settingsByWorkspace = new Map(settings.rows.map((row) => [row.workspace_id, row]));
  const membershipsByWorkspace = new Map();
  for (const row of memberships.rows) {
    const list = membershipsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      hourlyRate: numberValue(row.hourly_rate),
      currency: ["BRL", "USD", "EUR", "GBP"].includes(row.currency) ? row.currency : "USD",
      ...(row.invited_at ? { invitedAt: iso(row.invited_at) } : {}),
      ...(row.joined_at ? { joinedAt: iso(row.joined_at) } : {}),
      ...(row.deleted_at ? { deletedAt: iso(row.deleted_at) } : {}),
    });
    membershipsByWorkspace.set(row.workspace_id, list);
  }
  for (const row of invitations.rows) {
    const list = membershipsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      workspaceId: row.workspace_id,
      userId: row.id,
      role: row.role,
      status: "invited",
      hourlyRate: 0,
      currency: "USD",
      invitedAt: iso(row.invited_at),
    });
    membershipsByWorkspace.set(row.workspace_id, list);
  }
  const clientsByWorkspace = new Map();
  for (const row of clients.rows) {
    const list = clientsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      contact: row.contact,
      billable: row.billable ?? false,
      contractedHours: row.contracted_hours == null ? null : Number(row.contracted_hours),
      status: row.status,
      memberIds: row.member_ids ?? [],
      ...(row.currency ? { currency: row.currency } : {}),
    });
    clientsByWorkspace.set(row.workspace_id, list);
  }
  const memberIdsByProject = new Map();
  for (const row of projectMembers.rows) {
    const list = memberIdsByProject.get(row.project_id) ?? [];
    list.push(row.user_id);
    memberIdsByProject.set(row.project_id, list);
  }
  const projectsByWorkspace = new Map();
  for (const row of projects.rows) {
    const list = projectsByWorkspace.get(row.workspace_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      clientId: row.client_id,
      billable: row.billable,
      status: row.status,
      color: row.color,
      lastActivity: row.last_activity,
      memberIds: memberIdsByProject.get(row.id) ?? [],
    });
    projectsByWorkspace.set(row.workspace_id, list);
  }
  const entriesByWorkspace = new Map();
  for (const row of entries.rows) {
    const list = entriesByWorkspace.get(row.workspace_id) ?? [];
    list.push(timeEntryFromRow(row));
    entriesByWorkspace.set(row.workspace_id, list);
  }
  const avatarUrlsById = new Map();
  for (const row of identityRows.rows) {
    if (row.avatar_path) {
      avatarUrlsById.set(row.id, await signedStorageUrl(config, "avatars", row.avatar_path));
    }
  }
  const logoUrlsByWorkspaceId = new Map();
  for (const row of workspaces.rows) {
    if (row.logo_path) {
      logoUrlsByWorkspaceId.set(
        row.id,
        await signedStorageUrl(config, "workspace-logos", row.logo_path),
      );
    }
  }
  const preferencesByUserId = Object.fromEntries(
    profileIds.map((id) => {
      const row = preferences.rows.find((candidate) => candidate.user_id === id);
      const isOwnPreferences = id === user.id;
      return [
        id,
        {
          language: isOwnPreferences && row?.language === "en-US" ? "en-US" : "pt-BR",
          theme:
            isOwnPreferences && (row?.theme === "light" || row?.theme === "dark")
              ? row.theme
              : "system",
          avatarUrl:
            avatarUrlsById.get(id) ??
            avatarDataValue(row?.avatar_data_url) ??
            defaultAvatarForUser(id),
          timezone: isOwnPreferences ? (row?.timezone ?? "UTC") : "UTC",
          activeWorkspaceId: isOwnPreferences ? (row?.active_workspace_id ?? null) : null,
          reportFilters: isOwnPreferences ? reportFiltersValue(row?.report_filters) : {},
          favoriteTasks: isOwnPreferences ? favoriteTasksValue(row?.favorite_tasks) : {},
        },
      ];
    }),
  );
  return {
    version: 13,
    identities,
    workspaces: workspaces.rows.map((row) => ({
      workspace: {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        logoDataUrl: row.logo_data_url ?? logoUrlsByWorkspaceId.get(row.id) ?? null,
        status: row.status,
        createdAt: iso(row.created_at),
        ...(row.archived_at ? { archivedAt: iso(row.archived_at) } : {}),
      },
      memberships: membershipsByWorkspace.get(row.id) ?? [],
      entries: entriesByWorkspace.get(row.id) ?? [],
      projects: projectsByWorkspace.get(row.id) ?? [],
      clients: clientsByWorkspace.get(row.id) ?? [],
      settings: {
        weekStart: settingsByWorkspace.get(row.id)?.week_start === "sunday" ? "sunday" : "monday",
      },
      trello: emptyTrello(),
    })),
    preferencesByUserId,
  };
}
