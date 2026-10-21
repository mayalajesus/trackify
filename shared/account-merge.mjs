// Three-way merge: only changes relative to the loaded baseline are writes.
// Shared by the server and the browser's in-flight edit reconciliation.
export class AccountConflictError extends Error {
  constructor(path) {
    super("Your data changed in another session. Your unsaved changes have been kept.");
    this.name = "AccountConflictError";
    this.path = path;
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const recordKey = (path) => {
  const field = path.at(-1);
  if (field === "workspaces") return (item) => item?.workspace?.id;
  if (field === "memberships") return (item) => item?.userId;
  if (["identities", "entries", "projects", "clients"].includes(field)) return (item) => item?.id;
  return null;
};

function canonical(value, path = []) {
  if (Array.isArray(value)) {
    const key = recordKey(path);
    const list = key
      ? [...value].sort((a, b) => String(key(a)).localeCompare(String(key(b))))
      : path.at(-1) === "memberIds"
        ? [...value].sort()
        : value;
    return list.map((item) => canonical(item, [...path, "item"]));
  }
  if (isObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key], [...path, key])]),
    );
  // Signed Storage URLs expire independently of the image they identify.
  if (typeof value === "string" && ["avatarUrl", "logoDataUrl"].includes(path.at(-1))) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.pathname.startsWith("/storage/v1/object/sign/"))
        return `${url.origin}${url.pathname}`;
    } catch {
      // Data URLs and null values compare normally.
    }
  }
  return value;
}

export function accountsEqual(left, right) {
  if (left === right) return true;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

// Omit records unchanged in both snapshots. The three-way merge interprets
// absence from BOTH sides as no local edit, preserving the current server value.
// This avoids sending the complete history twice for every small edit.
export function prepareAccountSync(base, edited) {
  const baseAccount = structuredClone(base),
    account = structuredClone(edited);
  function trimRecords(before = [], after = [], key) {
    const old = new Map(before.map((item) => [key(item), item]));
    const next = new Map(after.map((item) => [key(item), item]));
    const changed = new Set(
      [...old.keys(), ...next.keys()].filter((id) => !accountsEqual(old.get(id), next.get(id))),
    );
    return [
      before.filter((item) => changed.has(key(item))),
      after.filter((item) => changed.has(key(item))),
    ];
  }
  [baseAccount.identities, account.identities] = trimRecords(
    baseAccount.identities,
    account.identities,
    (item) => item.id,
  );
  [baseAccount.workspaces, account.workspaces] = trimRecords(
    baseAccount.workspaces,
    account.workspaces,
    (item) => item.workspace.id,
  );
  for (const before of baseAccount.workspaces) {
    const after = account.workspaces.find((item) => item.workspace.id === before.workspace.id);
    if (!after) continue;
    for (const field of ["entries", "projects", "clients", "memberships"]) {
      [before[field], after[field]] = trimRecords(before[field], after[field], (item) =>
        field === "memberships" ? item.userId : item.id,
      );
    }
    if (before.workspace.logoDataUrl === after.workspace.logoDataUrl) {
      delete before.workspace.logoDataUrl;
      delete after.workspace.logoDataUrl;
    }
  }
  for (const id of Object.keys(baseAccount.preferencesByUserId)) {
    const before = baseAccount.preferencesByUserId[id],
      after = account.preferencesByUserId[id];
    if (accountsEqual(before, after)) {
      delete baseAccount.preferencesByUserId[id];
      delete account.preferencesByUserId[id];
    } else if (after && before.avatarUrl === after.avatarUrl) {
      delete before.avatarUrl;
      delete after.avatarUrl;
    }
  }
  return { baseAccount, account };
}

export function mergeAccountChanges(base, edited, current, options = {}) {
  function merge(before, local, remote, path) {
    const equal = (a, b) =>
      JSON.stringify(canonical(a, path)) === JSON.stringify(canonical(b, path));
    if (equal(before, local)) return remote;
    const key = recordKey(path);
    if (equal(local, remote)) return remote;
    if (
      equal(before, remote) &&
      ![before, local, remote].every(isObject) &&
      !(key && [before, local, remote].every(Array.isArray))
    )
      return local;
    if (key && [before, local, remote].every(Array.isArray)) {
      const index = (items) => {
        const result = new Map();
        for (const item of items) {
          const id = key(item);
          if (typeof id !== "string" || result.has(id))
            throw new AccountConflictError(path.join("."));
          result.set(id, item);
        }
        return result;
      };
      const previous = index(before),
        next = index(local),
        latest = index(remote);
      // Keep remote order, followed by new local records.
      return [...new Set([...latest.keys(), ...next.keys(), ...previous.keys()])]
        .map((id) => merge(previous.get(id), next.get(id), latest.get(id), [...path, id]))
        .filter((item) => item !== undefined);
    }
    if ([before, local, remote].every(isObject))
      return Object.fromEntries(
        [...new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(before)])]
          .filter((field) => !["__proto__", "prototype", "constructor"].includes(field))
          .map((field) => [
            field,
            merge(before[field], local[field], remote[field], [...path, field]),
          ])
          .filter(([, value]) => value !== undefined),
      );
    // Used only in the browser to keep edits made AFTER a request was sent.
    // The next server save still checks those edits against its new baseline.
    if (options.keepLocalOnConflict) return local;
    if (options.resolveConflict) return options.resolveConflict({ path, local, remote });
    throw new AccountConflictError(path.join("."));
  }
  return merge(base, edited, current, []);
}
