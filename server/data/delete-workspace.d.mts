import type { QueryClient } from "../data-api.mjs";
export function deleteWorkspace(
  client: QueryClient,
  user: { id: string },
  body: { workspaceId: string; confirmation: string },
): Promise<null>;
