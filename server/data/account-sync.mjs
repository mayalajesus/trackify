import { AccountConflictError, mergeAccountChanges } from "../../shared/account-merge.mjs";
import { DataApiError } from "../data-api-error.mjs";
import { loadAccount } from "./account.mjs";
import { syncAccount } from "./sync-account.mjs";
import { uuid } from "./validation.mjs";

// Caller owns a SERIALIZABLE transaction. Never interpret an old full snapshot
// as a replacement for current server data.
export async function synchronizeAccount(client, user, config, body, options = {}) {
  const { baseAccount, account } = body;
  if (
    !baseAccount ||
    !Array.isArray(baseAccount.workspaces) ||
    !Array.isArray(baseAccount.identities)
  )
    throw new DataApiError(
      428,
      "Reload the app before saving. Your unsaved changes have been kept.",
      {
        code: "sync_baseline_required",
      },
    );
  if (!account || !Array.isArray(account.workspaces) || !Array.isArray(account.identities))
    throw new DataApiError(400, "Invalid account payload.");
  // Stable lock ordering avoids opposite workspace orders in different tabs.
  const ids = [
    ...new Set(
      [...baseAccount.workspaces, ...account.workspaces].map((data) => uuid(data?.workspace?.id)),
    ),
  ].sort();
  await client.query(
    "select id from public.workspaces where id = any($1::uuid[]) order by id for update",
    [ids],
  );
  const current = await loadAccount(client, user, config, options);
  let merged;
  try {
    merged = mergeAccountChanges(baseAccount, account, current);
  } catch (error) {
    if (!(error instanceof AccountConflictError)) throw error;
    throw new DataApiError(409, error.message, { code: "sync_conflict" });
  }
  const obsoleteLogoPaths = await syncAccount(client, user, config, merged, current);
  return {
    obsoleteLogoPaths,
    account: await loadAccount(client, user, config, { profileEnsured: true }),
  };
}
