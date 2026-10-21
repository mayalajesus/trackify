import type { QueryClient } from "../data-api.mjs";
export function syncSharedTimers(
  client: QueryClient,
  userId: string,
  workspaceId: string,
): Promise<void>;
export function timerFromRow(row: Record<string, unknown>): Record<string, unknown>;
export function timerWithOwner(
  client: QueryClient,
  userId: string,
  workspaceId: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>>;
export function clearOwnTimer(
  client: QueryClient,
  userId: string,
  workspaceId: string,
  manageTransaction?: boolean,
  expectedTimer?: unknown,
): Promise<void>;

export function requireSharedTimerSource(
  client: QueryClient,
  userId: string,
  workspaceId: string,
  taskId?: string,
): Promise<void>;
