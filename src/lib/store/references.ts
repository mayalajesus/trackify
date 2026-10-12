import type { PersistedAccount } from "../account-types";

export function reuseIfEqual<T>(previous: T, next: T): T {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

export function reuseWorkspaceLogoUrl(previous: string | null, next: string | null) {
  if (!previous || !next || previous === next) return next;
  try {
    const oldUrl = new URL(previous);
    const newUrl = new URL(next);
    if (
      oldUrl.protocol !== "https:" ||
      !oldUrl.hostname.endsWith(".supabase.co") ||
      !oldUrl.pathname.startsWith("/storage/v1/object/sign/workspace-logos/") ||
      oldUrl.origin !== newUrl.origin ||
      oldUrl.pathname !== newUrl.pathname
    )
      return next;
    const payload = oldUrl.searchParams.get("token")?.split(".")[1];
    if (!payload) return next;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    // This only reads cache expiry; Storage still verifies the signature.
    // Refresh before expiry, but don't change the image src on every poll.
    return typeof exp === "number" && exp * 1000 > Date.now() + 5 * 60_000 ? previous : next;
  } catch {
    return next;
  }
}

export function shareAccountReferences(
  previous: PersistedAccount,
  next: PersistedAccount,
): PersistedAccount {
  const identities = reuseIfEqual(previous.identities, next.identities);
  const preferencesByUserId = reuseIfEqual(previous.preferencesByUserId, next.preferencesByUserId);
  const previousWorkspaces = new Map(
    previous.workspaces.map((workspace) => [workspace.workspace.id, workspace]),
  );
  const workspaces = next.workspaces.map((workspace) => {
    const previousWorkspace = previousWorkspaces.get(workspace.workspace.id);
    if (!previousWorkspace) return workspace;
    const shared = {
      ...workspace,
      workspace: reuseIfEqual(previousWorkspace.workspace, {
        ...workspace.workspace,
        logoDataUrl: reuseWorkspaceLogoUrl(
          previousWorkspace.workspace.logoDataUrl,
          workspace.workspace.logoDataUrl,
        ),
      }),
      memberships: reuseIfEqual(previousWorkspace.memberships, workspace.memberships),
      entries: reuseIfEqual(previousWorkspace.entries, workspace.entries),
      projects: reuseIfEqual(previousWorkspace.projects, workspace.projects),
      clients: reuseIfEqual(previousWorkspace.clients, workspace.clients),
      settings: reuseIfEqual(previousWorkspace.settings, workspace.settings),
      trello: reuseIfEqual(previousWorkspace.trello, workspace.trello),
    };
    const unchanged =
      shared.workspace === previousWorkspace.workspace &&
      shared.memberships === previousWorkspace.memberships &&
      shared.entries === previousWorkspace.entries &&
      shared.projects === previousWorkspace.projects &&
      shared.clients === previousWorkspace.clients &&
      shared.settings === previousWorkspace.settings &&
      shared.trello === previousWorkspace.trello;
    return unchanged ? previousWorkspace : shared;
  });
  const sharedWorkspaces =
    workspaces.length === previous.workspaces.length &&
    workspaces.every((workspace, index) => workspace === previous.workspaces[index])
      ? previous.workspaces
      : workspaces;
  if (
    identities === previous.identities &&
    preferencesByUserId === previous.preferencesByUserId &&
    sharedWorkspaces === previous.workspaces
  )
    return previous;
  return { ...next, identities, preferencesByUserId, workspaces: sharedWorkspaces };
}
