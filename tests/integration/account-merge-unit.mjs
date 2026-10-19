import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AccountConflictError,
  accountsEqual,
  mergeAccountChanges,
  prepareAccountSync,
} from "../../shared/account-merge.mjs";

const baseline = () => ({
  workspaces: [
    {
      workspace: { id: "ws", name: "Team" },
      clients: [{ id: "client", name: "Client", contact: "old" }],
      projects: [],
      entries: [],
    },
  ],
  identities: [],
  preferencesByUserId: {},
});

test("a stale tab preserves remote additions while saving its own new records", () => {
  const base = baseline(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.workspaces[0].projects.push({ id: "local", name: "Local project" });
  remote.workspaces[0].projects.push({ id: "remote", name: "Remote project" });
  const merged = mergeAccountChanges(base, local, remote);
  assert.deepEqual(
    merged.workspaces[0].projects.map((item) => item.id),
    ["remote", "local"],
  );
  assert.equal(base.workspaces[0].projects.length, 0);
});

test("independent fields on the same record merge without reverting remote edits", () => {
  const base = baseline(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.workspaces[0].clients[0].contact = "local contact";
  remote.workspaces[0].clients[0].name = "Remote name";
  assert.deepEqual(mergeAccountChanges(base, local, remote).workspaces[0].clients[0], {
    id: "client",
    name: "Remote name",
    contact: "local contact",
  });
});

test("conflicting updates reject the save without mutating either version", () => {
  const base = baseline(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.workspaces[0].clients[0].name = "Local";
  remote.workspaces[0].clients[0].name = "Remote";
  assert.throws(() => mergeAccountChanges(base, local, remote), AccountConflictError);
  assert.equal(local.workspaces[0].clients[0].name, "Local");
  assert.equal(remote.workspaces[0].clients[0].name, "Remote");
});

test("deletion conflicts with a concurrent edit and never resurrects a remotely deleted record", () => {
  const base = baseline(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.workspaces[0].clients = [];
  remote.workspaces[0].clients[0].name = "Remote edit";
  assert.throws(() => mergeAccountChanges(base, local, remote), AccountConflictError);
  assert.throws(() => mergeAccountChanges(base, remote, local), AccountConflictError);
  assert.deepEqual(mergeAccountChanges(base, base, local).workspaces[0].clients, []);
});

test("intentional deletion removes only the baseline record and keeps remote additions", () => {
  const base = baseline(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.workspaces[0].clients = [];
  remote.workspaces[0].clients.push({ id: "new", name: "New client" });
  assert.deepEqual(mergeAccountChanges(base, local, remote).workspaces[0].clients, [
    { id: "new", name: "New client" },
  ]);
});

test("repeating a committed request is idempotent even if its response was lost", () => {
  const base = baseline(),
    local = structuredClone(base);
  local.workspaces[0].entries.push({ id: "entry", task: "Work" });
  assert.deepEqual(mergeAccountChanges(base, local, local), local);
});

test("browser reconciliation retains edits made while a request is in flight", () => {
  const sent = baseline(),
    latest = structuredClone(sent),
    saved = structuredClone(sent);
  latest.workspaces[0].clients[0].name = "Typed while saving";
  saved.workspaces[0].clients[0].name = "Server normalized name";
  saved.workspaces[0].projects.push({ id: "remote", name: "Remote" });
  const result = mergeAccountChanges(sent, latest, saved, { keepLocalOnConflict: true });
  assert.equal(result.workspaces[0].clients[0].name, "Typed while saving");
  assert.equal(result.workspaces[0].projects[0].id, "remote");
});

test("array and object ordering and refreshed signed URLs do not create false conflicts", () => {
  const base = baseline(),
    current = structuredClone(base),
    local = structuredClone(base);
  base.workspaces[0].workspace.logoDataUrl =
    "https://example.supabase.co/storage/v1/object/sign/workspace-logos/ws/a.png?token=old";
  local.workspaces[0].workspace.logoDataUrl = base.workspaces[0].workspace.logoDataUrl;
  current.workspaces[0].workspace.logoDataUrl = base.workspaces[0].workspace.logoDataUrl.replace(
    "old",
    "new",
  );
  assert.ok(accountsEqual(base, current));
  local.workspaces[0].workspace.name = "New name";
  assert.equal(
    mergeAccountChanges(base, local, current).workspaces[0].workspace.logoDataUrl,
    current.workspaces[0].workspace.logoDataUrl,
  );
  assert.ok(
    accountsEqual(
      { projects: [{ id: "a" }, { id: "b" }] },
      { projects: [{ id: "b" }, { id: "a" }] },
    ),
  );
});

test("removal of workspace access conflicts with pending changes in that workspace", () => {
  const base = baseline(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.workspaces[0].entries.push({ id: "new", task: "Work" });
  remote.workspaces = [];
  assert.throws(() => mergeAccountChanges(base, local, remote), AccountConflictError);
});

test("compact transport preserves remote history, deletes and updates without sending unchanged records", () => {
  const base = {
    ...baseline(),
    preferencesByUserId: { user: { avatarUrl: "large image", theme: "light" } },
  };
  base.workspaces[0].entries = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    task: "History",
  }));
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.workspaces[0].entries[0].task = "Edited";
  local.workspaces[0].entries.splice(1, 1);
  remote.workspaces[0].entries.push({ id: "remote", task: "New remote record" });
  const payload = prepareAccountSync(base, local);
  assert.equal(payload.baseAccount.workspaces[0].entries.length, 2);
  assert.equal(payload.account.workspaces[0].entries.length, 1);
  assert.ok(JSON.stringify(payload).length < JSON.stringify(base).length / 5);
  assert.deepEqual(
    mergeAccountChanges(payload.baseAccount, payload.account, remote),
    mergeAccountChanges(base, local, remote),
  );
  assert.equal(base.workspaces[0].entries.length, 500);
});
