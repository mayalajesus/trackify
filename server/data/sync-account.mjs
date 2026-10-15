import { DataApiError } from "../data-api-error.mjs";
import { hasColumn, workspaceAccess } from "./access.mjs";
import { getSupabaseAdmin } from "./connections.mjs";
import { syncEntries } from "./entries.mjs";
import { ensureProfile } from "./profile.mjs";
import { workspaceLogoPath } from "./storage.mjs";
import {
  avatarDataValue,
  clientColorValue,
  dateValue,
  favoriteTasksValue,
  membershipBilling,
  normalizeProjectName,
  optionalCurrency,
  optionalText,
  parseImageDataUrl,
  projectColorValue,
  reportFiltersJson,
  requiredText,
  uuid,
} from "./validation.mjs";

export async function ensureProjectNameAvailable(
  client,
  workspaceId,
  clientId,
  name,
  projectId = null,
) {
  const result = await client.query(
    `select 1
       from public.projects
      where workspace_id = $1
        and client_id = $2
        and lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $3
        and ($4::uuid is null or id <> $4::uuid)
      limit 1`,
    [workspaceId, clientId, normalizeProjectName(name), projectId],
  );
  if (result.rows[0]) {
    throw new DataApiError(409, "A project with this name already exists for this client.");
  }
}

export async function syncAccount(client, user, config, account) {
  const obsoleteLogoPaths = [];
  if (!account || !Array.isArray(account.identities) || !Array.isArray(account.workspaces))
    throw new DataApiError(400, "Invalid account payload.");
  await ensureProfile(client, user, config);
  const hasLogoPath = await hasColumn(client, "workspaces", "logo_path");
  const hasActiveWorkspace = await hasColumn(client, "user_preferences", "active_workspace_id");
  const hasReportFilters = await hasColumn(client, "user_preferences", "report_filters");
  const identities = new Map(
    account.identities
      .filter((item) => item && typeof item.id === "string")
      .map((identity) => [identity.id, identity]),
  );
  const ownIdentity = identities.get(user.id);
  if (!ownIdentity) throw new DataApiError(400, "The authenticated profile is missing.");
  const ownName = String(ownIdentity.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const ownEmail = String(ownIdentity.email ?? "")
    .trim()
    .toLowerCase();
  if (!ownName || ownName.length > 120 || ownName.split(" ").length < 2) {
    throw new DataApiError(400, "A first and last name are required.");
  }
  if (ownEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownEmail)) {
    throw new DataApiError(400, "A valid email is required.");
  }
  const ownInitials = ownName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  await client.query(
    `update public.profiles set name = $2, email = $3, initials = $4, updated_at = now() where id = $1`,
    [user.id, ownName, ownEmail, ownInitials],
  );
  const ownPreferences = account.preferencesByUserId?.[user.id];
  if (ownPreferences) {
    const preferenceValues = [
      user.id,
      ownPreferences.language,
      ownPreferences.theme,
      ownPreferences.timezone,
    ];
    await client.query(
      `insert into public.user_preferences (user_id, language, theme, timezone)
       values ($1, $2, $3, $4)
       on conflict (user_id) do update set language = excluded.language, theme = excluded.theme, timezone = excluded.timezone, updated_at = now()`,
      preferenceValues,
    );
    if (ownPreferences.favoriteTasks !== undefined) {
      await client.query(
        `update public.user_preferences set favorite_tasks = $2::jsonb, updated_at = now() where user_id = $1`,
        [user.id, JSON.stringify(favoriteTasksValue(ownPreferences.favoriteTasks))],
      );
    }
    if (hasReportFilters) {
      await client.query(
        `update public.user_preferences set report_filters = $2::jsonb, updated_at = now() where user_id = $1`,
        [user.id, reportFiltersJson(ownPreferences.reportFilters)],
      );
    }
    if (await hasColumn(client, "user_preferences", "avatar_data_url")) {
      await client.query(
        `update public.user_preferences
            set avatar_data_url = coalesce($2, avatar_data_url), updated_at = now()
          where user_id = $1`,
        [user.id, avatarDataValue(ownPreferences.avatarUrl)],
      );
    }
  }
  for (const data of account.workspaces) {
    if (!data || typeof data !== "object" || !data.workspace) {
      throw new DataApiError(400, "Invalid workspace payload.");
    }
    for (const collection of ["memberships", "clients", "projects", "entries"]) {
      if (data[collection] !== undefined && !Array.isArray(data[collection])) {
        throw new DataApiError(400, "Invalid workspace payload.");
      }
    }
    const workspaceId = uuid(data.workspace.id);
    const ownerId = String(data.workspace.ownerId);
    if (data.workspace.status !== "active" && data.workspace.status !== "archived") {
      throw new DataApiError(400, "Choose a valid workspace status.");
    }
    const existingWorkspace = await client.query(
      `select owner_id, name, status, ${
        hasLogoPath ? "logo_path" : "null::text as logo_path"
      } from public.workspaces where id = $1 for update`,
      [workspaceId],
    );
    if (!existingWorkspace.rows[0]) {
      throw new DataApiError(409, "Create new workspaces with the createWorkspace operation.");
    }
    const access = await workspaceAccess(client, user.id, workspaceId);
    if (!access || access.membership_status !== "active") {
      throw new DataApiError(403, "You do not have permission to update this workspace.");
    }
    if (existingWorkspace.rows[0].owner_id !== ownerId) {
      throw new DataApiError(403, "The workspace owner cannot be changed.");
    }
    if (
      access.role !== "Owner" &&
      (data.workspace.name !== existingWorkspace.rows[0].name ||
        data.workspace.status !== existingWorkspace.rows[0].status)
    ) {
      throw new DataApiError(403, "Only the workspace Owner can edit it.");
    }
    if (existingWorkspace.rows[0] && access.status === "archived" && access.role !== "Owner") {
      continue;
    }
    let logoPath = existingWorkspace.rows[0]?.logo_path ?? null;
    if (access.role === "Owner" && config.databaseProvider !== "supabase") {
      const image = parseImageDataUrl(data.workspace.logoDataUrl);
      if (image && image.bytes.byteLength > 500_000) {
        throw new DataApiError(400, "Workspace logos must be smaller than 500 KB.");
      }
      if (image || data.workspace.logoDataUrl === null) {
        await client.query(`update public.workspaces set logo_data_url = $2 where id = $1`, [
          workspaceId,
          image ? `data:${image.contentType};base64,${image.bytes.toString("base64")}` : null,
        ]);
      }
    } else if (hasLogoPath && access.role === "Owner" && config.databaseProvider === "supabase") {
      const image = parseImageDataUrl(data.workspace.logoDataUrl);
      if (image && image.bytes.byteLength > 500_000) {
        throw new DataApiError(400, "Workspace logos must be smaller than 500 KB.");
      }
      if (image) {
        const nextPath = workspaceLogoPath(workspaceId, image, logoPath);
        if (nextPath !== logoPath) {
          const { error } = await getSupabaseAdmin(config)
            .storage.from("workspace-logos")
            .upload(nextPath, image.bytes, { contentType: image.contentType, upsert: false });
          if (error) throw new DataApiError(500, "Could not save the workspace logo.");
          if (logoPath) obsoleteLogoPaths.push(logoPath);
          logoPath = nextPath;
        }
      } else if (data.workspace.logoDataUrl === null && logoPath) {
        obsoleteLogoPaths.push(logoPath);
        logoPath = null;
      }
    }
    if (access.role !== "Member") {
      const workspaceValues = [
        workspaceId,
        requiredText(data.workspace.name, "Workspace name", 120),
        ownerId,
        data.workspace.status,
        data.workspace.createdAt,
        data.workspace.archivedAt ?? null,
      ];
      if (hasLogoPath) {
        await client.query(
          `insert into public.workspaces (id, name, owner_id, status, created_at, archived_at, logo_path)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (id) do update set name = excluded.name, owner_id = excluded.owner_id, status = excluded.status, archived_at = excluded.archived_at, logo_path = excluded.logo_path`,
          [...workspaceValues, logoPath],
        );
      } else {
        await client.query(
          `insert into public.workspaces (id, name, owner_id, status, created_at, archived_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do update set name = excluded.name, owner_id = excluded.owner_id, status = excluded.status, archived_at = excluded.archived_at`,
          workspaceValues,
        );
      }
      await client.query(
        `insert into public.workspace_settings (workspace_id, week_start)
         values ($1, $2)
         on conflict (workspace_id) do update set week_start = excluded.week_start, updated_at = now()`,
        [workspaceId, data.settings?.weekStart === "sunday" ? "sunday" : "monday"],
      );
    }
    const memberships = Array.isArray(data.memberships)
      ? data.memberships.filter((membership) => membership?.status !== "invited")
      : [];
    if (access.role === "Member") {
      const ownMembership = memberships.find((membership) => membership?.userId === user.id);
      if (!ownMembership || ownMembership.status !== "active") {
        throw new DataApiError(403, "You cannot remove your own workspace access.");
      }
      // Member snapshots may contain stale or tampered workspace fields.
      // Only their own time entries can be synchronized from this branch.
      await syncEntries(client, user.id, workspaceId, data.entries ?? []);
      continue;
    }
    const membershipByUserId = new Map();
    const deletedMembershipIds = new Set();
    const protectedMembershipIds = new Set();
    for (const membership of memberships) {
      if (!membership || typeof membership.userId !== "string") {
        throw new DataApiError(400, "Invalid workspace membership payload.");
      }
      if (
        !["Owner", "Admin", "Member"].includes(membership.role) ||
        !["active", "invited", "removed"].includes(membership.status)
      ) {
        throw new DataApiError(400, "Invalid workspace membership payload.");
      }
      membershipBilling(membership);
      membershipByUserId.set(membership.userId, membership);
      const identity = identities.get(membership.userId);
      if (!identity) throw new DataApiError(400, "A workspace member profile is missing.");
      const existingMembership = await client.query(
        `select role, status, to_jsonb(workspace_members)->>'deleted_at' as deleted_at from public.workspace_members where workspace_id = $1 and user_id = $2`,
        [workspaceId, membership.userId],
      );
      const previousMembership = existingMembership.rows[0];
      if (previousMembership?.deleted_at) {
        deletedMembershipIds.add(membership.userId);
        if (membership.status !== "removed" || membership.role !== previousMembership.role)
          throw new DataApiError(
            409,
            "This team membership was permanently deleted. Refresh the team before continuing.",
          );
        protectedMembershipIds.add(membership.userId);
      }
      if (!previousMembership && membership.userId !== user.id) {
        throw new DataApiError(
          403,
          "New workspace members must accept a valid invitation before they become active.",
        );
      }
      if (membership.userId !== user.id) {
        const existingProfile = await client.query(`select 1 from public.profiles where id = $1`, [
          membership.userId,
        ]);
        if (!existingProfile.rowCount) {
          await client.query(
            `insert into public.profiles (id, auth_issuer, name, email, initials) values ($1, $2, $3, $4, $5)`,
            [
              membership.userId,
              config.databaseProvider,
              String(identity.name ?? "Invited user"),
              String(identity.email ?? ""),
              String(identity.initials ?? "IU"),
            ],
          );
        }
      }
      if (
        membership.role === "Owner" &&
        (membership.userId !== ownerId || membership.status !== "active")
      ) {
        throw new DataApiError(400, "A workspace must have one active Owner.");
      }
      if (
        access.role === "Admin" &&
        membership.userId !== user.id &&
        ((membership.role === "Owner" && previousMembership?.role !== "Owner") ||
          (["Owner", "Admin"].includes(previousMembership?.role) &&
            (membership.role !== previousMembership.role ||
              membership.status !== previousMembership.status)))
      ) {
        throw new DataApiError(403, "Admins cannot manage Owners or Admins.");
      }
      if (
        access.role === "Admin" &&
        membership.userId !== user.id &&
        ["Owner", "Admin"].includes(previousMembership?.role)
      ) {
        protectedMembershipIds.add(membership.userId);
      }
    }
    const ownerMembership = membershipByUserId.get(ownerId);
    if (
      !ownerMembership ||
      ownerMembership.role !== "Owner" ||
      ownerMembership.status !== "active"
    ) {
      throw new DataApiError(400, "A workspace must have one active Owner.");
    }
    if (!membershipByUserId.has(user.id) || membershipByUserId.get(user.id).status !== "active") {
      throw new DataApiError(403, "You cannot remove your own workspace access.");
    }
    const existingMemberships = await client.query(
      `select user_id, role from public.workspace_members where workspace_id = $1`,
      [workspaceId],
    );
    for (const existingMembership of existingMemberships.rows) {
      if (membershipByUserId.has(existingMembership.user_id)) continue;
      if (
        existingMembership.role === "Owner" ||
        (access.role === "Admin" && existingMembership.role === "Admin")
      ) {
        throw new DataApiError(403, "You cannot remove this workspace member.");
      }
    }
    await client.query(`delete from public.project_members where workspace_id = $1`, [workspaceId]);
    await client.query(
      `delete from public.projects where workspace_id = $1 and not (id = any($2::uuid[]))`,
      [workspaceId, (data.projects ?? []).map((project) => uuid(project.id))],
    );
    await client.query(
      `delete from public.clients where workspace_id = $1 and not (id = any($2::uuid[]))`,
      [workspaceId, (data.clients ?? []).map((item) => uuid(item.id))],
    );
    await client.query(
      `delete from public.workspace_members where workspace_id = $1 and not (user_id = any($2::text[])) and to_jsonb(workspace_members)->>'deleted_at' is null`,
      [workspaceId, memberships.map((item) => String(item.userId))],
    );
    for (const membership of memberships) {
      // Protected members are included in every account snapshot. Validation
      // above rejects role/status changes; do not rewrite their other fields.
      if (protectedMembershipIds.has(membership.userId)) continue;
      if (membership.userId === user.id) {
        const billing = membershipBilling(membership);
        await client.query(
          `insert into public.workspace_members (workspace_id, user_id, role, status, hourly_rate, currency, invited_at, joined_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (workspace_id, user_id) do update set role = excluded.role, status = excluded.status, hourly_rate = excluded.hourly_rate, currency = excluded.currency, invited_at = excluded.invited_at, joined_at = excluded.joined_at`,
          [
            workspaceId,
            membership.userId,
            membership.role,
            membership.status,
            billing.hourlyRate,
            billing.currency,
            membership.invitedAt ?? null,
            membership.joinedAt ?? null,
          ],
        );
      } else {
        await client.query(
          `insert into public.workspace_members (workspace_id, user_id, role, status, invited_at, joined_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (workspace_id, user_id) do update set role = excluded.role, status = excluded.status, invited_at = excluded.invited_at, joined_at = excluded.joined_at`,
          [
            workspaceId,
            membership.userId,
            membership.role,
            membership.status,
            membership.invitedAt ?? null,
            membership.joinedAt ?? null,
          ],
        );
      }
    }
    for (const item of data.clients ?? []) {
      if (!item || typeof item !== "object") {
        throw new DataApiError(400, "Invalid client payload.");
      }
      if (item.status !== undefined && !["active", "on-hold", "archived"].includes(item.status)) {
        throw new DataApiError(400, "Choose a valid client status.");
      }
      if (
        item.memberIds !== undefined &&
        (!Array.isArray(item.memberIds) ||
          item.memberIds.some((id) => !membershipByUserId.has(id) || deletedMembershipIds.has(id)))
      ) {
        throw new DataApiError(400, "Only workspace members can be assigned to a client.");
      }
      if (item.billable !== undefined && typeof item.billable !== "boolean") {
        throw new DataApiError(400, "Invalid client billable value.");
      }
      if (item.currency !== undefined && !["BRL", "USD", "EUR"].includes(item.currency)) {
        throw new DataApiError(400, "Choose a valid currency.");
      }
      if (
        item.contractedHours != null &&
        (typeof item.contractedHours !== "number" ||
          !Number.isFinite(item.contractedHours) ||
          item.contractedHours <= 0)
      ) {
        throw new DataApiError(400, "Enter a positive number of contracted hours.");
      }
      const result = await client.query(
        `insert into public.clients (id, workspace_id, name, contact, billable, currency, contracted_hours, status, member_ids, color)
         values ($1, $2, $3, $4, coalesce($5::boolean, false), $6, $7, coalesce($9::text, 'active'), coalesce($10::uuid[], '{}'), coalesce($11::text, '#000000'))
         on conflict (id) do update set name = excluded.name, contact = excluded.contact,
           billable = coalesce($5::boolean, clients.billable),
           currency = coalesce(excluded.currency, clients.currency),
           contracted_hours = case when $8::boolean then excluded.contracted_hours else clients.contracted_hours end,
           status = coalesce($9::text, clients.status),
           member_ids = coalesce($10::uuid[], clients.member_ids),
           color = coalesce($11::text, clients.color)
         where clients.workspace_id = excluded.workspace_id
         returning id::text`,
        [
          uuid(item.id),
          workspaceId,
          requiredText(item.name, "Client name", 160),
          optionalText(item.contact, "Client contact", 2_000) ?? "",
          item.billable ?? null,
          optionalCurrency(item.currency),
          item.contractedHours ?? null,
          Object.hasOwn(item, "contractedHours"),
          item.status ?? null,
          item.memberIds === undefined ? null : [...new Set(item.memberIds)].map(uuid),
          item.color === undefined ? null : clientColorValue(item.color),
        ],
      );
      if (!result.rowCount) {
        throw new DataApiError(403, "A client identifier belongs to another workspace.");
      }
    }
    for (const project of data.projects ?? []) {
      if (!project || typeof project !== "object" || !Array.isArray(project.memberIds ?? [])) {
        throw new DataApiError(400, "Invalid project payload.");
      }
      const projectId = uuid(project.id);
      const projectName = requiredText(project.name, "Project name", 160).replace(/\s+/g, " ");
      if (!["active", "on-hold", "archived"].includes(project.status)) {
        throw new DataApiError(400, "Choose a valid project status.");
      }
      const clientId = uuid(project.clientId);
      await ensureProjectNameAvailable(client, workspaceId, clientId, projectName, projectId);
      const result = await client.query(
        `insert into public.projects (id, workspace_id, name, client_id, billable, status, color, last_activity)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set name = excluded.name, client_id = excluded.client_id, billable = excluded.billable, status = excluded.status, color = excluded.color, last_activity = excluded.last_activity
         where projects.workspace_id = excluded.workspace_id
         returning id::text`,
        [
          projectId,
          workspaceId,
          projectName,
          clientId,
          Boolean(project.billable),
          project.status,
          projectColorValue(project.color),
          dateValue(project.lastActivity),
        ],
      );
      if (!result.rowCount) {
        throw new DataApiError(403, "A project identifier belongs to another workspace.");
      }
      for (const memberId of project.memberIds ?? []) {
        if (membershipByUserId.get(memberId)?.status !== "active") {
          throw new DataApiError(400, "Only active members can be assigned to a project.");
        }
        await client.query(
          `insert into public.project_members (workspace_id, project_id, user_id) values ($1, $2, $3) on conflict do nothing`,
          [workspaceId, projectId, memberId],
        );
      }
    }
    await syncEntries(client, user.id, workspaceId, data.entries ?? []);
  }
  if (ownPreferences && hasActiveWorkspace) {
    const requestedWorkspaceId = ownPreferences.activeWorkspaceId
      ? uuid(ownPreferences.activeWorkspaceId)
      : null;
    const preferred = requestedWorkspaceId
      ? await client.query(
          `select 1
             from public.workspace_members wm
             join public.workspaces w on w.id = wm.workspace_id
            where wm.workspace_id = $1 and wm.user_id = $2
              and wm.status = 'active' and w.status = 'active'`,
          [requestedWorkspaceId, user.id],
        )
      : { rowCount: 0 };
    await client.query(
      `update public.user_preferences
          set active_workspace_id = $2, updated_at = now()
        where user_id = $1`,
      [user.id, preferred.rowCount ? requestedWorkspaceId : null],
    );
  }
  return obsoleteLogoPaths;
}
