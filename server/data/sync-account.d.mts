import type { QueryClient } from "../data-api.mjs";

export function syncAccount(
  client: QueryClient,
  user: { id: string; email: string; name?: string },
  config: Record<string, unknown>,
  account: Record<string, unknown>,
  currentAccount?: Record<string, unknown>,
): Promise<string[]>;
