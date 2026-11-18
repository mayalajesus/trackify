import type { DataSourceResult } from "./account-data-source";

export const conditionalOperations = new Set([
  "loadAccount",
  "loadReportEntries",
  "listTaskInvitations",
  "listTaskInvitationResponses",
  "listTaskParticipants",
]);
export const readOperations = new Set([
  ...conditionalOperations,
  "getActiveTimer",
  "listPendingInvitations",
  "getAccountDeletionStatus",
  "getOwnExtensionConnections",
  "exportAccountData",
]);

export function readsAffectedBy(operation: string): string[] | undefined {
  if (operation === "updatePreferences") return ["loadAccount"];
  if (["updateProfileName", "uploadAvatar", "removeAvatar"].includes(operation))
    return ["loadAccount", "listTaskInvitations", "listTaskInvitationResponses"];
  if (operation === "saveActiveTimer") return ["getActiveTimer", "listTaskInvitations"];
  return undefined;
}

type Cached = { revision: string; data: unknown; startedAt: number };
type Envelope = { readProtocol: 1; revision: string; notModified: boolean; data?: unknown };
type Send = (payload: Record<string, unknown>) => Promise<DataSourceResult<unknown>>;

export function createConditionalReads(now = Date.now) {
  const values = new Map<string, Cached>();
  const pending = new Map<string, Promise<DataSourceResult<unknown>>>();
  const failures = new Map<
    string,
    { attempts: number; retryAt: number; result: DataSourceResult<never> }
  >();
  let scope = "";
  let generation = 0;
  const operationGenerations = new Map<string, number>();
  const invalidate = (operations?: string[]) => {
    if (operations) {
      for (const operation of operations)
        operationGenerations.set(operation, (operationGenerations.get(operation) ?? 0) + 1);
      for (const map of [values, pending, failures]) {
        for (const key of map.keys()) if (operations.includes(JSON.parse(key)[0])) map.delete(key);
      }
      return;
    }
    generation++;
    operationGenerations.clear();
    values.clear();
    pending.clear();
    failures.clear();
  };
  const materialize = (operation: string, item: Cached) => {
    const data = structuredClone(item.data);
    if (operation !== "listTaskInvitations") return data;
    // validForMs is relative to the ORIGINAL response, not the cache hit.
    return (data as Array<{ validForMs: number }>)
      .map((invitation) => ({
        ...invitation,
        validForMs: Math.max(0, Number(invitation.validForMs) - (now() - item.startedAt)),
      }))
      .filter((invitation) => invitation.validForMs > 0);
  };
  return {
    invalidate,
    resetFailures: () => {
      for (const [key, failure] of failures) {
        if (failure.result.success || !failure.result.retryAfter || failure.retryAt <= now())
          failures.delete(key);
      }
    },
    setScope(next: string) {
      if (next !== scope) {
        invalidate();
        scope = next;
      }
    },
    async read<T>(
      operation: string,
      payload: Record<string, unknown>,
      send: Send,
    ): Promise<DataSourceResult<T>> {
      const key = JSON.stringify([
        operation,
        Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
      ]);
      const shared = pending.get(key);
      if (shared) return structuredClone(await shared) as DataSourceResult<T>;
      const failure = failures.get(key);
      if (failure && failure.retryAt > now()) return failure.result;
      const startedAt = now();
      const version = generation;
      const operationVersion = operationGenerations.get(operation) ?? 0;
      const cached = values.get(key);
      const request = (async (): Promise<DataSourceResult<unknown>> => {
        const result = await send({
          ...payload,
          readProtocol: 1,
          ...(cached ? { ifRevision: cached.revision } : {}),
        });
        if (
          version !== generation ||
          operationVersion !== (operationGenerations.get(operation) ?? 0)
        )
          return {
            success: false,
            error: "The data request was superseded.",
            code: "read_superseded",
          };
        if (!result.success) {
          const attempts = (failure?.attempts ?? 0) + 1;
          failures.set(key, {
            attempts,
            retryAt:
              now() +
              Math.max(
                (result.retryAfter ?? 0) * 1000,
                Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)),
              ),
            result,
          });
          while (failures.size > 64) failures.delete(failures.keys().next().value!);
          return result;
        }
        failures.delete(key);
        const envelope = result.data as Envelope | null;
        if (envelope?.readProtocol !== 1) return result; // Compatible with an older server.
        if (
          typeof envelope.revision !== "string" ||
          typeof envelope.notModified !== "boolean" ||
          (envelope.notModified
            ? !cached || cached.revision !== envelope.revision
            : !("data" in envelope))
        )
          return { success: false, error: "The server returned an invalid response." };
        const item = envelope.notModified
          ? cached!
          : { revision: envelope.revision, data: structuredClone(envelope.data), startedAt };
        values.delete(key);
        values.set(key, item);
        while (values.size > 64) values.delete(values.keys().next().value!);
        return { success: true, data: materialize(operation, item) };
      })();
      pending.set(key, request);
      try {
        return structuredClone(await request) as DataSourceResult<T>;
      } finally {
        if (pending.get(key) === request) pending.delete(key);
      }
    },
  };
}
