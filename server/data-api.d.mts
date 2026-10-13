export interface QueryClient {
  query: (
    sql: string,
    parameters?: unknown[],
  ) => Promise<{
    rowCount?: number | null;
    rows?: Array<Record<string, unknown>>;
  }>;
}

export function upsertOwnEntry(
  client: QueryClient,
  userId: string,
  workspaceId: string,
  entry: Record<string, unknown>,
  entryId: string,
): Promise<void>;
export function syncEntries(
  client: QueryClient,
  userId: string,
  workspaceId: string,
  entries: Array<Record<string, unknown>>,
): Promise<void>;
export function createWorkspace(
  client: QueryClient,
  user: { id: string; email: string; name?: string; avatarUrl?: string },
  config: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<{ workspaceId: string; account: Awaited<ReturnType<typeof loadAccount>> }>;
export function loadAccount(
  client: QueryClient,
  user: { id: string; email: string; name?: string; avatarUrl?: string },
  config: Record<string, unknown>,
): Promise<{
  version: number;
  identities: Array<{ id: string; name: string; email: string; initials: string }>;
  workspaces: Array<Record<string, unknown>>;
  preferencesByUserId: Record<string, Record<string, unknown>>;
}>;
export function acceptInvitation(
  client: QueryClient,
  user: { id: string; email: string; name?: string; avatarUrl?: string },
  config: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<{ workspaceId: string }>;
export function listPendingInvitations(
  client: QueryClient,
  user: { id: string; email: string },
): Promise<Array<{ id: string; workspaceName: string }>>;
export function readBody(request: unknown): Promise<Record<string, unknown>>;
export function handleDataRequest(
  request: unknown,
  response: unknown,
  env?: Record<string, string | undefined>,
): Promise<void>;
export function createDataMiddleware(
  env?: Record<string, string | undefined>,
): (request: unknown, response: unknown) => void;
