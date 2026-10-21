export class AccountConflictError extends Error {
  path: string;
}
export function accountsEqual(left: unknown, right: unknown): boolean;
export function prepareAccountSync<T>(base: T, edited: T): { baseAccount: T; account: T };
export function mergeAccountChanges<T>(
  base: T,
  edited: T,
  current: T,
  options?: {
    keepLocalOnConflict?: boolean;
    resolveConflict?: (conflict: { path: string[]; local: unknown; remote: unknown }) => unknown;
  },
): T;
