import type { PersistedAccount, WorkspaceData } from "../account-types";
import { isCurrencyCode, type BillingPreference } from "../billing";
import type { Member } from "../domain";
import { initialPreferences, initialTimer } from "./defaults";
import { membershipToMember, membersToMemberships } from "./membership";
import { elapsedForTimer } from "./timer";
import type { StoreResult } from "./types";
import { isFiniteNumber, isValidLogoUrl } from "./validation";

export function createWorkspaceActions({
  entries,
  projects,
  clients,
  settings,
  trello,
  workspaceCreationRef,
  accountScope,
  activeWorkspaceId,
  account,
  activeMemberId,
  timerRef,
  members,
  setAccount,
  setActiveWorkspaceId,
  setEntries,
  setProjects,
  setClients,
  setMembers,
  setSettingsState,
  setTrelloState,
  timerRevisionRef,
  setTimer,
  setElapsed,
  sessionStatus,
  authenticatedUserId,
  persistAccount,
  accountScopeRef,
  dataSource,
  accountForSyncRef,
  syncedAccountRef,
  accountRef,
  setTimerHydrated,
  setAccountError,
  accountSyncPromiseRef,
}: {
  entries: import("../domain").TimeEntry[];
  projects: import("../domain").Project[];
  clients: import("../domain").Client[];
  settings: import("../account-types").WorkspaceSettings;
  trello: import("../domain").TrelloState;
  workspaceCreationRef: React.RefObject<{
    scope: { userId: string; reloadKey: number };
    promise: Promise<import("@/lib/store/types").StoreResult>;
  } | null>;
  accountScope: { userId: string; reloadKey: number };
  activeWorkspaceId: string;
  account: import("@/lib/account-types").PersistedAccount;
  activeMemberId: string;
  timerRef: React.RefObject<import("@/lib/store/types").TimerState>;
  members: import("@/lib/domain").Member[];
  setAccount: React.Dispatch<React.SetStateAction<import("@/lib/account-types").PersistedAccount>>;
  setActiveWorkspaceId: React.Dispatch<React.SetStateAction<string>>;
  setEntries: React.Dispatch<React.SetStateAction<import("@/lib/domain").TimeEntry[]>>;
  setProjects: React.Dispatch<React.SetStateAction<import("@/lib/domain").Project[]>>;
  setClients: React.Dispatch<React.SetStateAction<import("@/lib/domain").Client[]>>;
  setMembers: React.Dispatch<React.SetStateAction<import("@/lib/domain").Member[]>>;
  setSettingsState: React.Dispatch<
    React.SetStateAction<import("@/lib/account-types").WorkspaceSettings>
  >;
  setTrelloState: React.Dispatch<React.SetStateAction<import("@/lib/domain").TrelloState>>;
  timerRevisionRef: React.RefObject<number>;
  setTimer: React.Dispatch<React.SetStateAction<import("@/lib/store/types").TimerState>>;
  setElapsed: React.Dispatch<React.SetStateAction<number>>;
  sessionStatus: import("@/lib/account-types").SessionStatus;
  authenticatedUserId: string;
  persistAccount: () => Promise<boolean>;
  accountScopeRef: React.RefObject<{ userId: string; reloadKey: number }>;
  dataSource: import("@/lib/account-data-source").AccountDataSource;
  accountForSyncRef: React.RefObject<import("@/lib/account-types").PersistedAccount>;
  syncedAccountRef: React.RefObject<import("@/lib/account-types").PersistedAccount | null>;
  accountRef: React.RefObject<import("@/lib/account-types").PersistedAccount>;
  setTimerHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  setAccountError: React.Dispatch<React.SetStateAction<string | null>>;
  accountSyncPromiseRef: React.RefObject<Promise<void> | null>;
}) {
  const switchWorkspace = (workspaceId: string): StoreResult => {
    if (workspaceCreationRef.current?.scope === accountScope)
      return { success: false, error: "Wait for workspace creation to finish." };
    if (workspaceId === activeWorkspaceId) return { success: true };
    const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
    if (!target) return { success: false, error: "This workspace could not be found." };
    if (target.workspace.status === "archived")
      return { success: false, error: "Archived workspaces are read-only. Restore it first." };
    const membership = target.memberships.find((candidate) => candidate.userId === activeMemberId);
    if (!membership || membership.status !== "active")
      return { success: false, error: "You do not have access to this workspace." };
    if (timerRef.current.status === "running")
      return { success: false, error: "Pause the active timer before switching workspaces." };
    const current = account.workspaces.find((data) => data.workspace.id === activeWorkspaceId);
    if (current) {
      const currentSnapshot: WorkspaceData = {
        ...current,
        entries,
        projects,
        clients,
        memberships: membersToMemberships(activeWorkspaceId, members, current.memberships),
        settings,
        trello,
      };
      setAccount((previous) => ({
        ...previous,
        workspaces: previous.workspaces.map((data) =>
          data.workspace.id === activeWorkspaceId ? currentSnapshot : data,
        ),
      }));
    }
    setActiveWorkspaceId(workspaceId);
    setAccount((currentAccount) => ({
      ...currentAccount,
      preferencesByUserId: {
        ...currentAccount.preferencesByUserId,
        [activeMemberId]: {
          ...(currentAccount.preferencesByUserId[activeMemberId] ?? initialPreferences),
          activeWorkspaceId: workspaceId,
        },
      },
    }));
    setEntries(target.entries);
    setProjects(target.projects);
    setClients(target.clients);
    setMembers(
      target.memberships
        .map((item) => membershipToMember(item, account.identities))
        .filter((member): member is Member => member !== null),
    );
    setSettingsState(target.settings);
    setTrelloState(target.trello);
    const nextTimer = initialTimer;
    timerRevisionRef.current += 1;

    timerRef.current = nextTimer;
    setTimer(nextTimer);
    setElapsed(elapsedForTimer(nextTimer));
    return { success: true };
  };

  const createWorkspace = async (
    name: string,
    billing: BillingPreference,
    logoDataUrl?: string | null,
  ): Promise<StoreResult> => {
    if (sessionStatus !== "active" || !authenticatedUserId)
      return { success: false, error: "Choose an active account." };
    if (workspaceCreationRef.current?.scope === accountScope)
      return workspaceCreationRef.current.promise;
    if (timerRef.current.status !== "idle")
      return {
        success: false,
        error: "Pause or stop the active timer before creating a workspace.",
      };
    if (account.workspaces.filter((data) => data.workspace.ownerId === activeMemberId).length >= 5)
      return { success: false, error: "You can create up to 5 workspaces." };
    const trimmedName = name.trim();
    if (!trimmedName) return { success: false, error: "A workspace name is required." };
    if (!isFiniteNumber(billing.hourlyRate) || billing.hourlyRate < 0) {
      return { success: false, error: "Choose a valid hourly rate." };
    }
    if (!isCurrencyCode(billing.currency)) {
      return { success: false, error: "Choose a valid currency." };
    }
    if (logoDataUrl !== undefined && !isValidLogoUrl(logoDataUrl)) {
      return { success: false, error: "Choose a PNG, JPG or WebP logo smaller than 500 KB." };
    }
    if (
      account.workspaces.some(
        (data) => data.workspace.name.toLowerCase() === trimmedName.toLowerCase(),
      )
    )
      return { success: false, error: "A workspace with this name already exists." };
    // Creation shares the account write queue. Older snapshots must finish
    // before the server selects the new workspace; later saves use its ID.
    const request = persistAccount().then(async (saved): Promise<StoreResult> => {
      if (!saved || accountScopeRef.current !== accountScope)
        return { success: false, error: "Could not save your pending changes." };
      const result = await dataSource.createWorkspace({
        name: trimmedName,
        hourlyRate: billing.hourlyRate,
        currency: billing.currency,
        ...(logoDataUrl !== undefined ? { logoDataUrl } : {}),
      });
      if (accountScopeRef.current !== accountScope)
        return { success: false, error: "Choose an active account." };
      if (!result.success) return { success: false, error: result.error };
      const created = result.data.account.workspaces.find(
        (data) => data.workspace.id === result.data.workspaceId,
      );
      if (!created) return { success: false, error: "This workspace could not be found." };
      const mergeCreated = (snapshot: PersistedAccount): PersistedAccount => ({
        ...snapshot,
        workspaces: [
          ...snapshot.workspaces.filter((data) => data.workspace.id !== created.workspace.id),
          created,
        ],
        preferencesByUserId: {
          ...snapshot.preferencesByUserId,
          [authenticatedUserId]: {
            ...(snapshot.preferencesByUserId[authenticatedUserId] ?? initialPreferences),
            activeWorkspaceId: created.workspace.id,
          },
        },
      });
      // Keep edits made in the previous workspace while the request was pending.
      const next = mergeCreated(accountForSyncRef.current);
      syncedAccountRef.current = mergeCreated(
        syncedAccountRef.current ?? accountForSyncRef.current,
      );
      accountForSyncRef.current = next;
      accountRef.current = next;
      setAccount(next);
      setActiveWorkspaceId(created.workspace.id);
      setEntries(created.entries);
      setProjects(created.projects);
      setClients(created.clients);
      setMembers(
        created.memberships
          .map((membership) => membershipToMember(membership, next.identities))
          .filter((member): member is Member => member !== null),
      );
      setSettingsState(created.settings);
      setTrelloState(created.trello);
      timerRevisionRef.current += 1;
      timerRef.current = initialTimer;
      setTimer(initialTimer);
      setTimerHydrated(false);
      setAccountError(null);
      return { success: true, id: created.workspace.id };
    });
    const tracked = request
      .then(() => undefined)
      .finally(() => {
        if (accountSyncPromiseRef.current === tracked) accountSyncPromiseRef.current = null;
        if (workspaceCreationRef.current?.promise === request) workspaceCreationRef.current = null;
      });
    accountSyncPromiseRef.current = tracked;
    workspaceCreationRef.current = { scope: accountScope, promise: request };
    return request;
  };

  const updateWorkspace = (
    workspaceId: string,
    patch: { name?: string; logoDataUrl?: string | null },
  ): StoreResult => {
    const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
    if (!target) return { success: false, error: "This workspace could not be found." };
    const membership = target.memberships.find((item) => item.userId === activeMemberId);
    if (!membership || membership.role !== "Owner" || membership.status !== "active")
      return { success: false, error: "Only the workspace Owner can edit it." };
    if (target.workspace.status === "archived")
      return { success: false, error: "Archived workspaces are read-only. Restore it first." };
    const name = patch.name === undefined ? target.workspace.name : patch.name.trim();
    if (!name) return { success: false, error: "A workspace name is required." };
    if (patch.logoDataUrl !== undefined && !isValidLogoUrl(patch.logoDataUrl))
      return { success: false, error: "Choose a PNG, JPG or WebP logo smaller than 500 KB." };
    setAccount((current) => ({
      ...current,
      workspaces: current.workspaces.map((data) =>
        data.workspace.id === workspaceId
          ? {
              ...data,
              workspace: {
                ...data.workspace,
                name,
                ...(patch.logoDataUrl !== undefined ? { logoDataUrl: patch.logoDataUrl } : {}),
              },
            }
          : data,
      ),
    }));
    return { success: true };
  };

  const setWorkspaceBilling = (workspaceId: string, billing: BillingPreference): StoreResult => {
    const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
    if (!target) return { success: false, error: "This workspace could not be found." };
    const membership = target.memberships.find((item) => item.userId === activeMemberId);
    if (!membership || membership.status !== "active") {
      return { success: false, error: "You do not have access to this workspace." };
    }
    if (target.workspace.status === "archived") {
      return { success: false, error: "Archived workspaces are read-only. Restore it first." };
    }
    if (!isFiniteNumber(billing.hourlyRate) || billing.hourlyRate < 0) {
      return { success: false, error: "Choose a valid hourly rate." };
    }
    if (!isCurrencyCode(billing.currency)) {
      return { success: false, error: "Choose a valid currency." };
    }
    setAccount((current) => ({
      ...current,
      workspaces: current.workspaces.map((data) =>
        data.workspace.id === workspaceId
          ? {
              ...data,
              memberships: data.memberships.map((item) =>
                item.userId === activeMemberId ? { ...item, ...billing } : item,
              ),
            }
          : data,
      ),
    }));
    return { success: true };
  };

  const archiveWorkspace = (workspaceId: string): StoreResult => {
    const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
    if (!target) return { success: false, error: "This workspace could not be found." };
    const membership = target.memberships.find((item) => item.userId === activeMemberId);
    if (!membership || membership.role !== "Owner" || membership.status !== "active")
      return { success: false, error: "Only the workspace Owner can archive it." };
    if (target.workspace.status === "archived")
      return { success: false, error: "This workspace is already archived." };
    if (timerRef.current.status !== "idle")
      return {
        success: false,
        error: "Pause or stop the active timer before archiving a workspace.",
      };

    const isCurrentWorkspace = workspaceId === activeWorkspaceId;
    const nextWorkspace = isCurrentWorkspace
      ? (account.workspaces.find(
          (data) =>
            data.workspace.id !== workspaceId &&
            data.workspace.status === "active" &&
            data.memberships.some(
              (item) => item.userId === activeMemberId && item.status === "active",
            ),
        ) ?? null)
      : null;
    if (isCurrentWorkspace && !nextWorkspace)
      return {
        success: false,
        error: "Keep at least one active workspace before archiving the current one.",
      };

    const currentSnapshot: WorkspaceData | null = isCurrentWorkspace
      ? {
          ...target,
          entries,
          projects,
          clients,
          memberships: membersToMemberships(activeWorkspaceId, members, target.memberships),
          settings,
          trello,
        }
      : null;
    const archivedAt = new Date().toISOString();
    setAccount((current) => ({
      ...current,
      workspaces: current.workspaces.map((data) => {
        if (data.workspace.id !== workspaceId) return data;
        const source = currentSnapshot ?? data;
        return {
          ...source,
          workspace: {
            ...source.workspace,
            status: "archived",
            archivedAt,
          },
        };
      }),
    }));

    if (nextWorkspace) {
      setActiveWorkspaceId(nextWorkspace.workspace.id);
      setAccount((currentAccount) => ({
        ...currentAccount,
        preferencesByUserId: {
          ...currentAccount.preferencesByUserId,
          [activeMemberId]: {
            ...(currentAccount.preferencesByUserId[activeMemberId] ?? initialPreferences),
            activeWorkspaceId: nextWorkspace.workspace.id,
          },
        },
      }));
      setEntries(nextWorkspace.entries);
      setProjects(nextWorkspace.projects);
      setClients(nextWorkspace.clients);
      setMembers(
        nextWorkspace.memberships
          .map((item) => membershipToMember(item, account.identities))
          .filter((member): member is Member => member !== null),
      );
      setSettingsState(nextWorkspace.settings);
      setTrelloState(nextWorkspace.trello);
      const nextTimer = initialTimer;
      timerRevisionRef.current += 1;

      timerRef.current = nextTimer;
      setTimer(nextTimer);
      setElapsed(elapsedForTimer(nextTimer));
    }
    return { success: true };
  };

  const restoreWorkspace = (workspaceId: string): StoreResult => {
    const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
    if (!target) return { success: false, error: "This workspace could not be found." };
    const membership = target.memberships.find((item) => item.userId === activeMemberId);
    if (!membership || membership.role !== "Owner")
      return { success: false, error: "Only the workspace Owner can restore it." };
    setAccount((current) => ({
      ...current,
      workspaces: current.workspaces.map((data) =>
        data.workspace.id === workspaceId
          ? (() => {
              const { archivedAt: _archivedAt, ...workspace } = data.workspace;
              return { ...data, workspace: { ...workspace, status: "active" as const } };
            })()
          : data,
      ),
    }));
    return { success: true };
  };

  const leaveWorkspace = (workspaceId: string): StoreResult => {
    const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
    const membership = target?.memberships.find((item) => item.userId === activeMemberId);
    if (!target || !membership || membership.status !== "active")
      return { success: false, error: "You are not an active member of this workspace." };
    if (membership.role === "Owner")
      return {
        success: false,
        error: "The Owner must archive the workspace instead of leaving it.",
      };
    if (timerRef.current.status !== "idle")
      return {
        success: false,
        error: "Pause or stop the active timer before leaving a workspace.",
      };
    const accessible = account.workspaces.filter(
      (data) =>
        data.workspace.id !== workspaceId &&
        data.memberships.some((item) => item.userId === activeMemberId && item.status === "active"),
    );
    if (accessible.length === 0)
      return {
        success: false,
        error: "Keep at least one workspace available before leaving this one.",
      };
    const nextWorkspace = accessible[0];
    if (!nextWorkspace) return { success: false, error: "No other workspace is available." };
    setAccount((current) => ({
      ...current,
      workspaces: current.workspaces.map((data) =>
        data.workspace.id === workspaceId
          ? {
              ...data,
              memberships: data.memberships.map((item) =>
                item.userId === activeMemberId ? { ...item, status: "removed" } : item,
              ),
              projects: data.projects.map((project) => ({
                ...project,
                memberIds: project.memberIds.filter((id) => id !== activeMemberId),
              })),
            }
          : data,
      ),
    }));
    setActiveWorkspaceId(nextWorkspace.workspace.id);
    setAccount((currentAccount) => ({
      ...currentAccount,
      preferencesByUserId: {
        ...currentAccount.preferencesByUserId,
        [activeMemberId]: {
          ...(currentAccount.preferencesByUserId[activeMemberId] ?? initialPreferences),
          activeWorkspaceId: nextWorkspace.workspace.id,
        },
      },
    }));
    setEntries(nextWorkspace.entries);
    setProjects(nextWorkspace.projects);
    setClients(nextWorkspace.clients);
    setMembers(
      nextWorkspace.memberships
        .map((item) => membershipToMember(item, account.identities))
        .filter((member): member is Member => member !== null),
    );
    setSettingsState(nextWorkspace.settings);
    setTrelloState(nextWorkspace.trello);
    const nextTimer = initialTimer;
    timerRevisionRef.current += 1;

    timerRef.current = nextTimer;
    setTimer(nextTimer);
    setElapsed(elapsedForTimer(nextTimer));
    return { success: true };
  };
  return {
    switchWorkspace,
    createWorkspace,
    updateWorkspace,
    setWorkspaceBilling,
    archiveWorkspace,
    restoreWorkspace,
    leaveWorkspace,
  };
}
