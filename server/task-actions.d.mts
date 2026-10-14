import type { QueryClient } from "./data-api.mjs";
export function taskDetailsValue(value: unknown): import("../src/lib/domain").TaskDetails | null;

export function handleTaskAction(
  client: QueryClient,
  user: { id: string },
  body: Record<string, unknown>,
  helpers: {
    requireWorkspaceAccess: (
      client: QueryClient,
      userId: string,
      workspaceId: string,
    ) => Promise<unknown>;
    uuid: (value: unknown) => string;
    timerFromRow: (value: unknown) => unknown;
  },
): Promise<unknown>;
