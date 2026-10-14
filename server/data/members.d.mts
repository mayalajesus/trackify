import type { QueryClient } from "../data-api.mjs";
export function deleteMember(
  client: QueryClient,
  user: { id: string },
  body: { workspaceId: string; memberId: string },
): Promise<{ deletedAt: string }>;
