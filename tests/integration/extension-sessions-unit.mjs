import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateExtension,
  createExtensionSession,
  refreshExtensionSession,
  hashToken,
} from "../../server/extension-sessions.mjs";
const id = "a".repeat(32),
  origin = `chrome-extension://${id}`,
  config = { extensionIds: id };
const request = (token) => ({ headers: { origin, authorization: `Bearer ${token}` } });
test("extension secrets are hashed and bound to the extension", async () => {
  let values;
  const client = {
    query: async (sql, args) => {
      values = args;
      return { rows: [{ id: "session" }] };
    },
  };
  const session = await createExtensionSession(
    client,
    { id: "user", name: "User", email: "test@example.com" },
    origin,
    id,
  );
  assert.equal(values[2], hashToken(session.token));
  assert.equal(values[3], hashToken(session.refreshToken));
  assert.equal(values[1], id);
  assert.ok(!values.includes(session.refreshToken));
  await assert.rejects(() =>
    createExtensionSession(client, { extensionSessionId: "s" }, origin, id),
  );
  await assert.rejects(() =>
    createExtensionSession(client, { id: "user" }, "https://evil.test", id),
  );
});
test("access cannot renew or escape scope; refresh cannot control timers", async () => {
  const pool = { query: async () => ({ rows: [{ session_id: "s", id: "user" }] }) };
  const access = "txa_" + "a".repeat(64),
    refresh = "txr_" + "b".repeat(64);
  for (const operation of ["syncAccount", "createExtensionSession", "refreshExtensionSession"])
    await assert.rejects(() => authenticateExtension(request(access), config, pool, operation));
  await assert.rejects(() =>
    authenticateExtension(request(refresh), config, pool, "extensionTimerAction"),
  );
  await assert.rejects(() =>
    authenticateExtension(
      { headers: { authorization: `Bearer ${access}` } },
      config,
      pool,
      "getExtensionContext",
    ),
  );
  assert.equal(
    (await authenticateExtension(request(access), config, pool, "getExtensionContext")).id,
    "user",
  );
  await assert.rejects(() =>
    authenticateExtension(
      request(access),
      config,
      { query: async () => ({ rows: [] }) },
      "getExtensionContext",
    ),
  );
});
test("renewal refuses revoked/expired sessions even after authentication", async () => {
  await assert.rejects(() =>
    refreshExtensionSession({ query: async () => ({ rows: [] }) }, { extensionSessionId: "s" }),
  );
});
