import type { QueryClient } from "../data-api.mjs";
import type { PersistedAccount } from "../../src/lib/account-types";
export function synchronizeAccount(
  client: QueryClient,
  user: { id: string; email: string; name?: string },
  config: Record<string, unknown>,
  body: { account?: PersistedAccount; baseAccount?: PersistedAccount },
  options?: { profileEnsured?: boolean },
): Promise<{ obsoleteLogoPaths: string[]; account: PersistedAccount }>;
