import { createClientActions } from "@/lib/store/client-actions";
import { createEntryActions } from "@/lib/store/entry-actions";
import { createMemberActions } from "@/lib/store/member-actions";
import { createProjectActions } from "@/lib/store/project-actions";
import { createTimerActions } from "@/lib/store/timer-actions";
import { createWorkspaceActions } from "@/lib/store/workspace-actions";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PersistedAccount,
  SessionStatus,
  UserPreferences,
  WorkspaceData,
  WorkspaceSettings,
  WorkspaceSummary,
} from "./account-types";
import { createApiDataSource } from "./api-data-source";
import { useAuth } from "./auth-context";
import { defaultCurrencyForLocale, type BillingPreference, type CurrencyCode } from "./billing";
import { resetSessionDefaultAvatar } from "./default-avatar";
import type { Client, Member, Project, TimeEntry, TrelloState } from "./domain";
import { getElapsedSeconds, getEndDateForEntry, getLocalToday, isValidDateOnly } from "./format";
import {
  canTrackProject as canTrackProjectForRole,
  hasPermission,
  type Permission,
} from "./permissions";
import { projectIsBillable } from "./project-billability";
import { entriesForReportWindow, reportEntriesQueryName } from "./report-query";
import { initialPreferences, initialSettings, initialTimer, initialTrello } from "./store/defaults";
import { inviteEmailPattern } from "./store/ids";
import { initialsFromName, membershipToMember, membersToMemberships } from "./store/membership";
import { getDevicePreferences, getInitialTimeZone } from "./store/preferences";
import { reuseIfEqual, shareAccountReferences } from "./store/references";
import { elapsedForTimer } from "./store/timer";
import type { StoreResult, StoreValue, TimerState } from "./store/types";
import { isValidPreferences } from "./store/validation";
import { findTimeEntryConflict, type ScopedTimeIntervalEntry } from "./time-entry-overlap";
import {
  recentTimerTasksFromEntries,
  rememberRecentTimerTask,
  validateTimerDetails,
} from "./timer-start";

export { findTimeEntryConflict, timeEntriesOverlap } from "./time-entry-overlap";

export type {
  PersistedAccount,
  SessionStatus,
  ThemeMode,
  UserIdentity,
  UserPreferences,
  Workspace,
  WorkspaceData,
  WorkspaceMembership,
  WorkspaceSettings,
  WorkspaceStatus,
  WorkspaceSummary,
} from "./account-types";

export type { Permission } from "./permissions";

export type { TimerStatus } from "./store/types";

export type { TimerState } from "./store/types";

export type { StoreResult } from "./store/types";

export { isValidTimeZone } from "./store/preferences";

export { getInitialTimeZone } from "./store/preferences";

export { getDevicePreferences } from "./store/preferences";

export { migrateAccountSnapshot } from "./store/migrations";

export { repairDuplicateEntryIds } from "./store/migrations";

export { makeSeedAccount } from "./store/seed-account";

export { isValidAccount } from "./store/validation";

export { elapsedForTimer } from "./store/timer";

export { pauseTimerAt } from "./store/timer";

const StoreContext = createContext<StoreValue | null>(null);

const TimerTickerContext = createContext<{ elapsed: number } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useAuth();
  const authenticatedUserId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const dataSource = useMemo(() => createApiDataSource(), []);
  const [account, setAccount] = useState<PersistedAccount>({
    version: 13,
    identities: [],
    workspaces: [],
    preferencesByUserId: {},
  });
  const [activeMemberId, setActiveMemberId] = useState(() => authenticatedUserId);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("signed-out");
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [timerPersistenceError, setTimerPersistenceError] = useState<string | null>(null);
  const [accountReloadKey, setAccountReloadKey] = useState(0);
  const accountScope = useMemo(
    () => ({ userId: authenticatedUserId, reloadKey: accountReloadKey }),
    [authenticatedUserId, accountReloadKey],
  );
  const accountScopeRef = useRef(accountScope);
  accountScopeRef.current = accountScope;
  const [hydrated, setHydrated] = useState(false);
  const [timerHydrated, setTimerHydrated] = useState(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const syncedAccountRef = useRef<PersistedAccount | null>(null);
  const accountRefreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const accountSyncPromiseRef = useRef<Promise<void> | null>(null);
  const timerSyncPromiseRef = useRef<Promise<void> | null>(null);
  const persistedTimerRef = useRef<{
    scope: typeof accountScope;
    workspaceId: string;
    value: string;
  } | null>(null);
  const workspaceCreationRef = useRef<{
    scope: typeof accountScope;
    promise: Promise<StoreResult>;
  } | null>(null);
  const activeData =
    account.workspaces.find((data) => data.workspace.id === activeWorkspaceId) ??
    account.workspaces[0];
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const membersRef = useRef(members);
  membersRef.current = members;
  const [settings, setSettingsState] = useState<WorkspaceSettings>(initialSettings);
  const [trello, setTrelloState] = useState<TrelloState>(initialTrello);
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const accountForSync = useMemo(() => {
    const current = account.workspaces.find((data) => data.workspace.id === activeWorkspaceId);
    if (!current) return account;
    const next: WorkspaceData = {
      ...current,
      entries,
      projects,
      clients,
      memberships: membersToMemberships(activeWorkspaceId, members, current.memberships),
      settings,
      trello,
    };
    if (
      current.entries === entries &&
      current.projects === projects &&
      current.clients === clients &&
      current.settings === settings &&
      current.trello === trello &&
      JSON.stringify(current.memberships) === JSON.stringify(next.memberships)
    )
      return account;
    return {
      ...account,
      workspaces: account.workspaces.map((data) =>
        data.workspace.id === activeWorkspaceId ? next : data,
      ),
    };
  }, [account, activeWorkspaceId, clients, entries, members, projects, settings, trello]);
  const accountForSyncRef = useRef(accountForSync);
  accountForSyncRef.current = accountForSync;
  const [elapsed, setElapsed] = useState(() => elapsedForTimer(timer));
  const storedPreferences = account.preferencesByUserId[activeMemberId] ?? initialPreferences;
  const deviceTimeZone = getInitialTimeZone();
  const preferences = useMemo(
    () => getDevicePreferences(storedPreferences, deviceTimeZone),
    [deviceTimeZone, storedPreferences],
  );
  const currentWorkspace = activeData?.workspace ?? null;
  const currentWorkspaceMembership =
    activeData?.memberships.find((membership) => membership.userId === activeMemberId) ?? null;
  const workspaceBilling = useMemo<BillingPreference>(
    () =>
      currentWorkspaceMembership
        ? {
            hourlyRate: currentWorkspaceMembership.hourlyRate,
            currency: currentWorkspaceMembership.currency,
          }
        : { hourlyRate: 0, currency: defaultCurrencyForLocale(preferences.language) },
    [currentWorkspaceMembership, preferences.language],
  );
  const billingPreferencesByUserId = useMemo(
    () =>
      Object.fromEntries(
        (activeData?.memberships ?? []).map((membership) => [
          membership.userId,
          { hourlyRate: membership.hourlyRate, currency: membership.currency },
        ]),
      ),
    [activeData?.memberships],
  );
  const [today, setToday] = useState(() => getLocalToday(new Date(), preferences.timezone));
  const currentMember = members.find((member) => member.id === activeMemberId) ?? null;
  const timerRef = useRef(timer);
  const timerRevisionRef = useRef(0);
  const acceptingTaskRef = useRef(false);
  const timerWorkspaceRef = useRef(activeWorkspaceId);
  timerWorkspaceRef.current = activeWorkspaceId;
  timerRef.current = timer;
  const recentTasks = useMemo(() => {
    const entriesForMember = entries.filter((entry) => entry.userId === activeMemberId);
    const recent = recentTimerTasksFromEntries(entriesForMember);
    if (timer.status === "idle" || timer.workspaceId !== activeWorkspaceId) return recent;
    return rememberRecentTimerTask(recent, timer);
  }, [activeMemberId, activeWorkspaceId, entries, timer]);
  const retryAccountLoad = useCallback(() => setAccountReloadKey((value) => value + 1), []);

  const persistAccount = useCallback((): Promise<boolean> => {
    const previousSync = accountSyncPromiseRef.current ?? Promise.resolve();
    const request = previousSync
      .catch(() => undefined)
      .then(async () => {
        if (!authenticatedUserId || accountScopeRef.current !== accountScope) return false;
        const snapshot = accountForSyncRef.current;
        if (JSON.stringify(snapshot) === JSON.stringify(syncedAccountRef.current)) return true;
        const result = await dataSource.syncAccount(authenticatedUserId, snapshot);
        if (accountScopeRef.current !== accountScope) return false;
        if (!result.success) {
          setAccountError(result.error);
          return false;
        }
        syncedAccountRef.current = snapshot;
        setAccountError(null);
        return true;
      });
    const trackedSync: Promise<void> = request
      .then(() => undefined)
      .finally(() => {
        if (accountSyncPromiseRef.current === trackedSync) accountSyncPromiseRef.current = null;
      });
    accountSyncPromiseRef.current = trackedSync;
    return request;
  }, [accountScope, authenticatedUserId, dataSource]);

  const refreshAccount = useCallback(async (): Promise<boolean> => {
    if (authLoading || !authenticatedUserId || !hydrated) return false;
    const scope = accountScope;
    if (accountScopeRef.current !== scope) return false;
    // Polls must not replace edits waiting for the debounce or an active save.
    if (
      accountSyncPromiseRef.current ||
      JSON.stringify(accountForSyncRef.current) !== JSON.stringify(syncedAccountRef.current)
    )
      return false;
    if (accountRefreshPromiseRef.current) {
      const previousResult = await accountRefreshPromiseRef.current;
      if (accountScopeRef.current !== scope) return false;
      return previousResult;
    }
    const request = (async () => {
      if (accountScopeRef.current !== scope) return false;
      const snapshot = accountForSyncRef.current;
      const result = await dataSource.loadAccount(authenticatedUserId);
      if (accountScopeRef.current !== scope || accountForSyncRef.current !== snapshot) return false;
      if (!result.success) {
        setAccountError(result.error);
        return false;
      }

      const loadedAccount = shareAccountReferences(accountRef.current, result.data);
      const preferredWorkspaceId =
        loadedAccount.preferencesByUserId[authenticatedUserId]?.activeWorkspaceId;
      const currentWorkspace = loadedAccount.workspaces.find(
        (data) =>
          data.workspace.id === activeWorkspaceId &&
          data.workspace.status === "active" &&
          data.memberships.some(
            (membership) =>
              membership.userId === authenticatedUserId && membership.status === "active",
          ),
      );
      const nextWorkspace =
        currentWorkspace ??
        loadedAccount.workspaces.find(
          (data) =>
            data.workspace.id === preferredWorkspaceId &&
            data.workspace.status === "active" &&
            data.memberships.some(
              (membership) =>
                membership.userId === authenticatedUserId && membership.status === "active",
            ),
        ) ??
        loadedAccount.workspaces.find(
          (data) =>
            data.workspace.status === "active" &&
            data.memberships.some(
              (membership) =>
                membership.userId === authenticatedUserId && membership.status === "active",
            ),
        );
      if (!nextWorkspace) {
        syncedAccountRef.current = loadedAccount;
        setAccount(loadedAccount);
        setActiveWorkspaceId("");
        setEntries([]);
        setProjects([]);
        setClients([]);
        setMembers([]);
        setSettingsState(initialSettings);
        setTrelloState(initialTrello);
        setTimer(initialTimer);
        setTimerHydrated(false);
        setAccountError(null);
        return true;
      }

      const mappedMembers = nextWorkspace.memberships
        .map((membership) => membershipToMember(membership, loadedAccount.identities))
        .filter((member): member is Member => member !== null);
      const nextMembers = reuseIfEqual(membersRef.current, mappedMembers);
      const workspaceChanged = nextWorkspace.workspace.id !== activeWorkspaceId;
      syncedAccountRef.current = loadedAccount;
      setAccount(loadedAccount);
      setActiveWorkspaceId(nextWorkspace.workspace.id);
      setEntries(nextWorkspace.entries);
      setProjects(nextWorkspace.projects);
      setClients(nextWorkspace.clients);
      setMembers(nextMembers);
      setSettingsState(nextWorkspace.settings);
      setTrelloState(nextWorkspace.trello);
      if (workspaceChanged) {
        setTimer(initialTimer);
        setTimerHydrated(false);
      }
      setAccountError(null);
      return true;
    })();
    accountRefreshPromiseRef.current = request;
    try {
      return await request;
    } finally {
      if (accountRefreshPromiseRef.current === request) accountRefreshPromiseRef.current = null;
    }
  }, [accountScope, activeWorkspaceId, authLoading, dataSource, hydrated, authenticatedUserId]);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!authenticatedUserId) {
      syncedAccountRef.current = null;
      setTimerPersistenceError(null);
      setAccountLoading(false);
      setAccountError(null);
      setHydrated(false);
      setTimerHydrated(false);
      setSessionStatus("signed-out");
      setAccount({ version: 13, identities: [], workspaces: [], preferencesByUserId: {} });
      setActiveMemberId("");
      setActiveWorkspaceId("");
      setEntries([]);
      setProjects([]);
      setClients([]);
      setMembers([]);
      setTimer(initialTimer);
      return;
    }

    setSessionStatus("active");
    setAccountLoading(true);
    setAccountError(null);
    setHydrated(false);
    setTimerHydrated(false);
    setActiveMemberId(authenticatedUserId);
    void dataSource.loadAccount(authenticatedUserId).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setAccountLoading(false);
        setAccountError(result.error);
        return;
      }
      const loadedAccount = result.data;
      const preferredWorkspaceId =
        loadedAccount.preferencesByUserId[authenticatedUserId]?.activeWorkspaceId;
      const canUseWorkspace = (data: WorkspaceData) =>
        data.workspace.status === "active" &&
        data.memberships.some(
          (membership) =>
            membership.userId === authenticatedUserId && membership.status === "active",
        );
      const nextWorkspace =
        loadedAccount.workspaces.find(
          (data) => data.workspace.id === preferredWorkspaceId && canUseWorkspace(data),
        ) ?? loadedAccount.workspaces.find(canUseWorkspace);
      if (!nextWorkspace) {
        syncedAccountRef.current = loadedAccount;
        setAccount(loadedAccount);
        setActiveWorkspaceId("");
        setEntries([]);
        setProjects([]);
        setClients([]);
        setMembers([]);
        setSettingsState(initialSettings);
        setTrelloState(initialTrello);
        setTimer(initialTimer);
        setTimerHydrated(false);
        setHydrated(true);
        setAccountLoading(false);
        setAccountError(null);
        return;
      }
      const nextMembers =
        nextWorkspace?.memberships
          .map((membership) => membershipToMember(membership, loadedAccount.identities))
          .filter((member): member is Member => member !== null) ?? [];
      syncedAccountRef.current = loadedAccount;
      setAccount(loadedAccount);
      setActiveWorkspaceId(nextWorkspace?.workspace.id ?? "");
      setEntries(nextWorkspace?.entries ?? []);
      setProjects(nextWorkspace?.projects ?? []);
      setClients(nextWorkspace?.clients ?? []);
      setMembers(nextMembers);
      setSettingsState(nextWorkspace?.settings ?? initialSettings);
      setTrelloState(nextWorkspace?.trello ?? initialTrello);
      setTimer(initialTimer);
      setHydrated(true);
      setAccountLoading(false);
      setAccountError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [accountReloadKey, authLoading, dataSource, authenticatedUserId]);

  useEffect(() => {
    if (!hydrated || !authenticatedUserId) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAccount();
    };
    const id = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [hydrated, refreshAccount, authenticatedUserId]);

  useEffect(() => {
    if (!hydrated || !activeWorkspaceId) return;
    const reportQueries = queryClient.getQueryCache().findAll({
      predicate: (query) => {
        const [name, parameters] = query.queryKey as [
          unknown,
          { workspaceId?: string; startDate?: string; endDate?: string } | undefined,
        ];
        return (
          name === reportEntriesQueryName &&
          parameters?.workspaceId === activeWorkspaceId &&
          typeof parameters.startDate === "string" &&
          typeof parameters.endDate === "string"
        );
      },
    });
    for (const query of reportQueries) {
      if (query.state.dataUpdatedAt === 0) continue;
      const parameters = query.queryKey[1] as {
        startDate: string;
        endDate: string;
      };
      queryClient.setQueryData(
        query.queryKey,
        entriesForReportWindow(entries, parameters.startDate, parameters.endDate),
      );
    }
  }, [activeWorkspaceId, entries, hydrated, queryClient]);

  useEffect(() => {
    if (!hydrated || !authenticatedUserId || !activeWorkspaceId) return;
    let cancelled = false;
    setTimerHydrated(false);
    setTimerPersistenceError(null);
    const timerRevision = timerRevisionRef.current;
    void (async () => {
      // Finish earlier writes before reading the timer for this workspace.
      if (timerSyncPromiseRef.current) await timerSyncPromiseRef.current;
      if (cancelled || accountScopeRef.current !== accountScope) return;
      const result = await dataSource.getActiveTimer(authenticatedUserId, activeWorkspaceId);
      if (cancelled || accountScopeRef.current !== accountScope) return;
      if (!result.success) {
        setTimerPersistenceError(result.error);
        return;
      }
      const hydratedTimer = result.data ?? initialTimer;
      persistedTimerRef.current = {
        scope: accountScope,
        workspaceId: activeWorkspaceId,
        value: JSON.stringify(hydratedTimer),
      };
      // Do not let a slow hydration response overwrite a timer the user started
      // while the request was in flight. Once hydrated, the persistence effect
      // below saves that newer local timer normally.
      if (timerRevisionRef.current === timerRevision) {
        timerRef.current = hydratedTimer;
        setTimer(hydratedTimer);
      }
      setTimerHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountScope, activeMemberId, activeWorkspaceId, dataSource, hydrated, authenticatedUserId]);

  useEffect(() => {
    if (!hydrated || !timerHydrated || !authenticatedUserId || !activeWorkspaceId) return;
    // Let users complete older timers in the editor before persisting them.
    if (timer.status !== "idle" && !validateTimerDetails(timer.task, timer.projectId).success)
      return;
    let cancelled = false;
    const isCurrent = () => !cancelled && accountScopeRef.current === accountScope;
    const previous = timerSyncPromiseRef.current ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(async () => {
        if (!isCurrent()) return;
        const value = JSON.stringify(timer);
        if (
          persistedTimerRef.current?.scope === accountScope &&
          persistedTimerRef.current.workspaceId === activeWorkspaceId &&
          persistedTimerRef.current.value === value
        )
          return;
        // Save project/entry changes before the timer references them or is cleared.
        if (!(await persistAccount()) || !isCurrent()) return;
        const result =
          timer.status === "idle"
            ? await dataSource.clearActiveTimer(authenticatedUserId, activeWorkspaceId)
            : await dataSource.saveActiveTimer(authenticatedUserId, timer);
        if (accountScopeRef.current !== accountScope) return;
        if (!result.success) {
          persistedTimerRef.current = null;
          if (isCurrent()) setTimerPersistenceError(result.error);
          return;
        }
        // Even an obsolete in-flight save changed the server. The next queued
        // operation must see that result (especially a stop following a start).
        persistedTimerRef.current = { scope: accountScope, workspaceId: activeWorkspaceId, value };
        if (isCurrent()) setTimerPersistenceError(null);
      });
    const tracked = request.finally(() => {
      if (timerSyncPromiseRef.current === tracked) timerSyncPromiseRef.current = null;
    });
    timerSyncPromiseRef.current = tracked;
    return () => {
      cancelled = true;
    };
  }, [
    activeMemberId,
    activeWorkspaceId,
    dataSource,
    hydrated,
    authenticatedUserId,
    timer,
    timerHydrated,
    accountScope,
    persistAccount,
  ]);

  useEffect(() => {
    const current = account.workspaces.find((data) => data.workspace.id === activeWorkspaceId);
    if (!current) return;
    const next: WorkspaceData = {
      ...current,
      entries,
      projects,
      clients,
      memberships: membersToMemberships(activeWorkspaceId, members, current.memberships),
      settings,
      trello,
    };
    if (
      current.entries === entries &&
      current.projects === projects &&
      current.clients === clients &&
      current.settings === settings &&
      current.trello === trello &&
      JSON.stringify(current.memberships) === JSON.stringify(next.memberships)
    )
      return;
    setAccount((previous) => ({
      ...previous,
      workspaces: previous.workspaces.map((data) =>
        data.workspace.id === activeWorkspaceId ? next : data,
      ),
    }));
  }, [
    account.workspaces,
    activeWorkspaceId,
    clients,
    entries,
    members,
    projects,
    settings,
    trello,
  ]);

  useEffect(() => {
    if (!hydrated || !authenticatedUserId) return;
    // Hydration and refreshes are reads, not local edits. Compare against the
    // actual server snapshot instead of skipping the next arbitrary render.
    if (JSON.stringify(accountForSync) === JSON.stringify(syncedAccountRef.current)) return;
    const id = window.setTimeout(() => {
      void persistAccount();
    }, 200);
    return () => window.clearTimeout(id);
  }, [accountForSync, hydrated, authenticatedUserId, persistAccount]);

  useEffect(() => {
    const refreshToday = () => setToday(getLocalToday(new Date(), preferences.timezone));
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") refreshToday();
    };
    refreshToday();
    const id = window.setInterval(refreshToday, 60_000);
    window.addEventListener("focus", refreshToday);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshToday);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [preferences.timezone]);

  useEffect(() => {
    const refreshElapsed = () => setElapsed(elapsedForTimer(timerRef.current));
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") refreshElapsed();
    };
    refreshElapsed();
    window.addEventListener("focus", refreshElapsed);
    document.addEventListener("visibilitychange", refreshWhenActive);
    if (timer.status !== "running")
      return () => {
        window.removeEventListener("focus", refreshElapsed);
        document.removeEventListener("visibilitychange", refreshWhenActive);
      };
    const id = window.setInterval(refreshElapsed, 1000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshElapsed);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [timer.status, timer.startedAt, timer.accumulated]);

  const value = useMemo<StoreValue>(() => {
    const can = (permission: Permission): boolean =>
      hasPermission(currentMember?.role ?? null, permission, {
        sessionActive: sessionStatus === "active",
        memberActive: currentMember?.status === "active",
        workspaceStatus: currentWorkspace?.status ?? "archived",
      });

    const canTrackProject = (projectId: string): boolean => {
      const project = projects.find((candidate) => candidate.id === projectId);
      return canTrackProjectForRole(currentMember?.role ?? null, activeMemberId, project ?? null, {
        sessionActive: sessionStatus === "active",
        memberActive: currentMember?.status === "active",
      });
    };

    const validateProjectId = (projectId: string | null, allowUnassigned = false): StoreResult => {
      if (projectId === null) return { success: true };
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) return { success: false, error: "This project no longer exists." };
      if (allowUnassigned) return { success: true };
      if (project.status === "archived")
        return {
          success: false,
          error: "This project is archived and cannot be used to start a timer.",
        };
      if (project.status !== "active")
        return {
          success: false,
          error: "This project is inactive and cannot be used to start a timer.",
        };
      if (canTrackProject(projectId)) return { success: true };
      return { success: false, error: "This project is not assigned to your team member." };
    };

    const validateEntry = (
      entry: Omit<TimeEntry, "id">,
      allowExistingProjectId?: string | null,
    ): StoreResult => {
      const projectValidation = validateProjectId(
        entry.projectId,
        entry.projectId === allowExistingProjectId,
      );
      if (!projectValidation.success) return projectValidation;
      if (!entry.task.trim()) return { success: false, error: "A task is required." };
      if (!isValidDateOnly(entry.date)) return { success: false, error: "Choose a valid date." };
      if (entry.endDate && (!isValidDateOnly(entry.endDate) || entry.endDate < entry.date))
        return { success: false, error: "Choose a valid end date." };
      const endDate = getEndDateForEntry(entry);
      const calculated = getElapsedSeconds({ ...entry, endDate });
      if (calculated <= 0 || entry.seconds <= 0)
        return { success: false, error: "End time must be after start time." };
      if (Math.abs(calculated - entry.seconds) > 1)
        return { success: false, error: "Duration must match the selected time range." };
      return { success: true };
    };

    const findEntryConflict = (
      entry: Omit<TimeEntry, "id">,
      excludedEntryId?: string,
    ): TimeEntry | undefined =>
      findTimeEntryConflict(
        { ...entry, workspaceId: activeWorkspaceId },
        entries.map((existing): ScopedTimeIntervalEntry & TimeEntry => ({
          ...existing,
          workspaceId: activeWorkspaceId,
        })),
        {
          ...(excludedEntryId ? { excludeEntryId: excludedEntryId } : {}),
          timeZone: preferences.timezone,
        },
      );

    const currencyForProject = (projectId: string | null): CurrencyCode => {
      const project = projects.find((item) => item.id === projectId);
      return (
        clients.find((client) => client.id === project?.clientId)?.currency ??
        workspaceBilling.currency
      );
    };

    const billableForProject = (projectId: string | null) =>
      projectIsBillable(projectId, projects, clients);
    const {
      acceptTaskInvitation,
      startTimer,
      startTimerFromTask,
      updateTimer,
      setTimerElapsed,
      pauseTimer,
      resumeTimer,
      stopTimer,
    } = createTimerActions({
      acceptingTaskRef,
      timerRef,
      timerSyncPromiseRef,
      accountScopeRef,
      accountScope,
      timerWorkspaceRef,
      activeWorkspaceId,
      timerRevisionRef,
      persistedTimerRef,
      setTimer,
      setElapsed,
      workspaceCreationRef,
      can,
      validateProjectId,
      billableForProject,
      preferences,
      workspaceBilling,
      currencyForProject,
      projects,
      canTrackProject,
      activeMemberId,
      findEntryConflict,
      setEntries,
    });
    const { addEntry, updateEntry, deleteEntry, restoreEntry } = createEntryActions({
      can,
      activeMemberId,
      timerRef,
      billableForProject,
      workspaceBilling,
      currencyForProject,
      validateEntry,
      findEntryConflict,
      setEntries,
      entries,
      preferences,
    });

    const { addProject, updateProject, deleteProject } = createProjectActions({
      can,
      clients,
      projects,
      members,
      activeMemberId,
      setProjects,
      setAccount,
      activeWorkspaceId,
      entries,
      timerRef,
    });
    const { addClient, updateClient, deleteClient } = createClientActions({
      can,
      members,
      setClients,
      workspaceBilling,
      preferences,
      clients,
      projects,
    });
    const {
      inviteMember,
      resendInvite,
      cancelInvite,
      removeMember,
      restoreMember,
      updateMemberRole,
    } = createMemberActions({
      can,
      members,
      dataSource,
      activeWorkspaceId,
      setMembers,
      setAccount,
      activeMemberId,
      currentMember,
      setProjects,
    });

    const setTrello = (patch: Partial<TrelloState>): StoreResult => {
      if (!can("manage-integrations"))
        return { success: false, error: "Only Admins and the Owner can manage integrations." };
      setTrelloState((current) => ({ ...current, ...patch }));
      return { success: true };
    };

    const setWorkspaceSettings = (
      patch: Partial<WorkspaceSettings>,
      workspaceId = activeWorkspaceId,
    ): StoreResult => {
      const target = account.workspaces.find((data) => data.workspace.id === workspaceId);
      if (!target) return { success: false, error: "This workspace could not be found." };
      const membership = target.memberships.find((item) => item.userId === activeMemberId);
      if (
        !membership ||
        membership.status !== "active" ||
        !["Owner", "Admin"].includes(membership.role)
      )
        return {
          success: false,
          error: "Only Admins and the Owner can change workspace settings.",
        };
      if (target.workspace.status === "archived")
        return { success: false, error: "Archived workspaces are read-only. Restore it first." };
      const next = {
        ...(workspaceId === activeWorkspaceId ? settings : target.settings),
        ...patch,
      };
      if (next.weekStart !== "monday" && next.weekStart !== "sunday")
        return { success: false, error: "Choose a valid week start." };
      if (workspaceId === activeWorkspaceId) setSettingsState(next);
      else
        setAccount((current) => ({
          ...current,
          workspaces: current.workspaces.map((data) =>
            data.workspace.id === workspaceId ? { ...data, settings: next } : data,
          ),
        }));
      return { success: true };
    };

    const setUserPreferences = (patch: Partial<UserPreferences>): StoreResult => {
      if (sessionStatus !== "active" || !currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const next = { ...preferences, ...patch };
      if (!isValidPreferences(next))
        return { success: false, error: "Choose valid personal preferences." };
      setAccount((current) => ({
        ...current,
        preferencesByUserId: {
          ...current.preferencesByUserId,
          [activeMemberId]: {
            ...(current.preferencesByUserId[activeMemberId] ?? initialPreferences),
            ...patch,
          },
        },
      }));
      return { success: true };
    };

    const saveUserPreferences = async (patch: Partial<UserPreferences>): Promise<StoreResult> => {
      if (sessionStatus !== "active" || !currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const next = { ...preferences, ...patch };
      if (!isValidPreferences(next))
        return { success: false, error: "Choose valid personal preferences." };
      const remote = await dataSource.updatePreferences(activeMemberId, patch);
      if (!remote.success) return remote;
      setAccount((current) => ({
        ...current,
        preferencesByUserId: { ...current.preferencesByUserId, [activeMemberId]: next },
      }));
      return { success: true };
    };

    const updateCurrentMemberEmail = (email: string): StoreResult => {
      if (!currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const normalizedEmail = email.trim().toLowerCase();
      if (!inviteEmailPattern.test(normalizedEmail))
        return { success: false, error: "Enter a valid email address." };
      if (
        members.some(
          (member) =>
            member.id !== activeMemberId && member.email.toLowerCase() === normalizedEmail,
        )
      )
        return { success: false, error: "This email is already part of the team." };
      setAccount((current) => ({
        ...current,
        identities: current.identities.map((identity) =>
          identity.id === activeMemberId ? { ...identity, email: normalizedEmail } : identity,
        ),
      }));
      setMembers((list) =>
        list.map((member) =>
          member.id === activeMemberId ? { ...member, email: normalizedEmail } : member,
        ),
      );
      return { success: true };
    };

    const updateCurrentMemberName = (name: string): StoreResult => {
      if (!currentMember || currentMember.status !== "active")
        return { success: false, error: "Choose an active account." };
      const normalizedName = name.trim().replace(/\s+/g, " ");
      if (!normalizedName) return { success: false, error: "A name is required." };
      if (normalizedName.split(" ").length < 2)
        return { success: false, error: "Enter your first and last name." };
      if (normalizedName.length > 120)
        return { success: false, error: "Name must be 120 characters or fewer." };
      const initials = initialsFromName(normalizedName);
      setAccount((current) => ({
        ...current,
        identities: current.identities.map((identity) =>
          identity.id === activeMemberId
            ? { ...identity, name: normalizedName, initials }
            : identity,
        ),
      }));
      setMembers((list) =>
        list.map((member) =>
          member.id === activeMemberId ? { ...member, name: normalizedName, initials } : member,
        ),
      );
      return { success: true };
    };
    const {
      switchWorkspace,
      createWorkspace,
      updateWorkspace,
      setWorkspaceBilling,
      archiveWorkspace,
      restoreWorkspace,
      leaveWorkspace,
    } = createWorkspaceActions({
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
    });

    const setActiveMember = (memberId: string): StoreResult => {
      const member = members.find(
        (candidate) => candidate.id === memberId && candidate.status === "active",
      );
      if (!member) return { success: false, error: "Choose an active account in this workspace." };
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before changing accounts." };
      const nextTimer = initialTimer;
      timerRevisionRef.current += 1;

      timerRef.current = nextTimer;
      setTimer(nextTimer);
      setElapsed(elapsedForTimer(nextTimer));
      setTimerHydrated(false);
      setActiveMemberId(memberId);
      return { success: true };
    };

    const signOut = (): StoreResult => {
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before signing out." };
      resetSessionDefaultAvatar();
      setSessionStatus("signed-out");
      return { success: true };
    };

    const resumeSession = (memberId: string): StoreResult => {
      const member = members.find(
        (candidate) => candidate.id === memberId && candidate.status === "active",
      );
      if (!member) return { success: false, error: "Choose an active account." };
      if (timerRef.current.status !== "idle")
        return { success: false, error: "Stop the active timer before changing accounts." };
      resetSessionDefaultAvatar();
      const nextTimer = initialTimer;
      timerRevisionRef.current += 1;

      timerRef.current = nextTimer;
      setTimer(nextTimer);
      setElapsed(elapsedForTimer(nextTimer));
      setActiveMemberId(memberId);
      setSessionStatus("active");
      return { success: true };
    };

    const summaries: WorkspaceSummary[] = account.workspaces
      .filter((data) =>
        data.memberships.some((item) => item.userId === activeMemberId && item.status === "active"),
      )
      .map((data) => {
        const membership = data.memberships.find((item) => item.userId === activeMemberId)!;
        const owner = account.identities.find((identity) => identity.id === data.workspace.ownerId);
        return {
          ...data.workspace,
          ownerName: owner?.name ?? "Unknown owner",
          weekStart:
            data.workspace.id === activeWorkspaceId ? settings.weekStart : data.settings.weekStart,
          role: membership.role,
          membershipStatus: membership.status,
          isOwned: data.workspace.ownerId === activeMemberId,
          hourlyRate: membership.hourlyRate,
          currency: membership.currency,
        };
      });

    return {
      entries,
      projects,
      clients,
      members,
      timer,
      recentTasks,
      trello,
      settings,
      preferences,
      preferencesByUserId: account.preferencesByUserId,
      workspaceBilling,
      billingPreferencesByUserId,
      currentMember,
      currentWorkspace,
      currentWorkspaceMembership,
      workspaces: summaries,
      activeWorkspaceId,
      sessionStatus,
      accountLoading,
      accountError: accountError ?? timerPersistenceError,
      retryAccountLoad,
      can,
      canTrackProject,
      findEntryConflict,
      setActiveMember,
      currentUserId: activeMemberId,
      today,
      startTimer,
      startTimerFromTask,
      acceptTaskInvitation,
      updateTimer,
      setTimerElapsed,
      pauseTimer,
      resumeTimer,
      stopTimer,
      addEntry,
      updateEntry,
      deleteEntry,
      restoreEntry,
      addProject,
      updateProject,
      deleteProject,
      addClient,
      updateClient,
      deleteClient,
      inviteMember,
      resendInvite,
      cancelInvite,
      removeMember,
      restoreMember,
      updateMemberRole,
      setTrello,
      setWorkspaceSettings,
      setUserPreferences,
      saveUserPreferences,
      updateCurrentMemberName,
      updateCurrentMemberEmail,
      switchWorkspace,
      createWorkspace,
      setWorkspaceBilling,
      updateWorkspace,
      archiveWorkspace,
      restoreWorkspace,
      leaveWorkspace,
      signOut,
      resumeSession,
    };
  }, [
    account,
    accountError,
    accountLoading,
    accountScope,
    activeMemberId,
    activeWorkspaceId,
    clients,
    currentMember,
    currentWorkspaceMembership,
    currentWorkspace,
    dataSource,
    entries,
    members,
    preferences,
    workspaceBilling,
    billingPreferencesByUserId,
    projects,
    recentTasks,
    persistAccount,
    retryAccountLoad,
    authenticatedUserId,
    sessionStatus,
    settings,
    timer,
    timerPersistenceError,
    today,
    trello,
  ]);

  const tickerValue = useMemo(() => ({ elapsed }), [elapsed]);

  return (
    <StoreContext.Provider value={value}>
      <TimerTickerContext.Provider value={tickerValue}>{children}</TimerTickerContext.Provider>
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}

export function useTimerTicker(): { elapsed: number } {
  const context = useContext(TimerTickerContext);
  if (!context) throw new Error("useTimerTicker must be used inside StoreProvider");
  return context;
}

export function useProjectName(): (id: string | null) => string {
  const { projects } = useStore();
  return (id: string | null) =>
    id === null
      ? "No project"
      : (projects.find((project) => project.id === id)?.name ?? "Unknown project");
}
