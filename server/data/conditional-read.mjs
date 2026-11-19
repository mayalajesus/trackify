import { createHash } from "node:crypto";
import { requireWorkspaceAccess } from "./access.mjs";
import { uuid } from "./validation.mjs";

export const conditionalOperations = new Set([
  "loadAccount",
  "loadReportEntries",
  "getExtensionContext",
  "listTaskInvitations",
  "listTaskInvitationResponses",
  "listTaskParticipants",
]);
const DAY = 24 * 60 * 60_000;

// A revision describes the exact authenticated scope, never just a table's max
// timestamp. Deletions and role changes must invalidate it as well.
export async function readFingerprint(client, user, body, config = {}) {
  const operation = body.operation;
  const memberships = await client.query(
    `select w.id::text, w.status, m.role from public.workspace_members m
     join public.workspaces w on w.id=m.workspace_id
     where m.user_id=$1 and m.status='active' order by w.id`,
    [user.id],
  );
  if (operation !== "loadAccount" && operation !== "getExtensionContext")
    await requireWorkspaceAccess(client, user.id, uuid(body.workspaceId));
  if (operation === "getExtensionContext" && body.workspaceId)
    await requireWorkspaceAccess(client, user.id, uuid(body.workspaceId));

  const scopes = ["loadAccount", "getExtensionContext"].includes(operation)
    ? [
        ["user", user.id, "profiles"],
        ["user", user.id, "user_preferences"],
      ]
    : [];
  for (const workspace of memberships.rows) {
    const id = workspace.id;
    const relevant =
      operation === "loadAccount" || operation === "getExtensionContext" || id === body.workspaceId;
    if (!relevant) continue;
    if (operation !== "loadReportEntries")
      scopes.push(["workspace", id, "catalog"], ["workspace", id, "people"]);
    if (operation === "loadAccount") scopes.push(["workspace", id, "invitations"]);
    if (["loadAccount", "loadReportEntries", "listTaskInvitations"].includes(operation)) {
      // The inbox also depends on the sender's completed entries.
      scopes.push(
        workspace.role === "Member" && operation !== "listTaskInvitations"
          ? ["workspace_user", `${id}:${user.id}`, "entries"]
          : ["workspace", id, "entries"],
      );
    }
    if (
      [
        "getExtensionContext",
        "listTaskInvitations",
        "listTaskInvitationResponses",
        "listTaskParticipants",
      ].includes(operation)
    )
      scopes.push(["workspace", id, "collaboration"]);
    if (["getExtensionContext", "listTaskInvitations"].includes(operation))
      scopes.push(["workspace", id, "timers"]);
  }
  const result = await client.query(
    `select r.scope,r.scope_id,r.domain,r.revision::text from public.read_revisions r
     join jsonb_to_recordset($1::jsonb) as wanted(scope text,scope_id text,domain text)
       using(scope,scope_id,domain) order by r.scope,r.scope_id,r.domain`,
    [JSON.stringify(scopes.map(([scope, scope_id, domain]) => ({ scope, scope_id, domain })))],
  );
  return createHash("sha256")
    .update(
      JSON.stringify([
        2,
        // A copied database can have identical IDs and revisions while its
        // signed media URLs belong to a different project. Only server config
        // identifies that backend; request fields must never choose it.
        config.databaseProvider ?? null,
        config.supabaseUrl ?? null,
        config.neonAuthIssuer ?? null,
        user.id,
        user.extensionSessionId ?? null,
        operation,
        body.workspaceId ?? null,
        body.startDate ?? null,
        body.endDate ?? null,
        memberships.rows,
        result.rows,
      ]),
    )
    .digest("hex");
}

export function revisionMatches(revision, fingerprint, now = Date.now()) {
  if (typeof revision !== "string" || revision.length > 100) return false;
  const [hash, expiry] = revision.split(".");
  const expiresAt = Number(expiry);
  return (
    hash === fingerprint && Number.isFinite(expiresAt) && expiresAt > now && expiresAt <= now + DAY
  );
}

function mediaExpiry(data, now) {
  let expiry = now + DAY;
  const urls = [
    ...Object.values(data.preferencesByUserId ?? {}).map((item) => item.avatarUrl),
    ...(data.workspaces ?? []).map((item) => item.workspace?.logoDataUrl),
  ];
  for (const value of urls) {
    if (typeof value !== "string" || !value.startsWith("https://")) continue;
    try {
      const url = new URL(value);
      if (!url.pathname.startsWith("/storage/v1/object/sign/")) continue;
      const claims = JSON.parse(
        Buffer.from(url.searchParams.get("token").split(".")[1], "base64url").toString(),
      );
      if (Number.isFinite(claims.exp)) expiry = Math.min(expiry, claims.exp * 1000 - 5 * 60_000);
    } catch {
      /* Unknown media URLs retain the bounded daily refresh. */
    }
  }
  return expiry;
}

// Caller owns a REPEATABLE READ transaction. Revision and payload must come
// from the same snapshot, even if a writer commits while this read is running.
export async function conditionalRead(client, user, body, load, config = {}, now = Date.now()) {
  const fingerprint = await readFingerprint(client, user, body, config);
  if (revisionMatches(body.ifRevision, fingerprint, now))
    return { readProtocol: 1, notModified: true, revision: body.ifRevision };
  const data = await load();
  let expiresAt = now + DAY;
  if (body.operation === "loadAccount") {
    expiresAt = mediaExpiry(data, now);
    const next = await client.query(
      `select extract(epoch from min(i.expires_at))*1000 as expiry
       from public.workspace_invitations i join public.workspace_members m on m.workspace_id=i.workspace_id
       where m.user_id=$1 and m.status='active' and m.role in ('Owner','Admin')
         and i.status='pending' and i.expires_at>now()`,
      [user.id],
    );
    if (next.rows[0]?.expiry) expiresAt = Math.min(expiresAt, Number(next.rows[0].expiry));
  }
  if (body.operation === "listTaskInvitations")
    for (const item of data) expiresAt = Math.min(expiresAt, now + Number(item.validForMs));
  if (body.operation === "getExtensionContext") {
    // The owner's invited-member list changes when a pending invitation expires.
    const next = await client.query(
      `select extract(epoch from min(expires_at))*1000 as expiry from public.task_invitations
       where workspace_id=$1 and invited_by=$2 and status='pending' and expires_at>now()`,
      [data.workspaceId ?? null, user.id],
    );
    if (next.rows[0]?.expiry) expiresAt = Math.min(expiresAt, Number(next.rows[0].expiry));
  }
  return {
    readProtocol: 1,
    notModified: false,
    revision: `${fingerprint}.${Math.floor(expiresAt)}`,
    data,
  };
}
