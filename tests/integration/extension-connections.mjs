import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createQaClient } from "../support/qa-fixtures.mjs";
import {
  createExtensionSession,
  getOwnExtensionConnections,
  disconnectOwnExtensions,
  authenticateExtension,
} from "../../server/extension-sessions.mjs";
const client = createQaClient("extension-connections");
await client.connect();
try {
  await client.query("begin");
  const users = [0, 1].map(() => ({
    id: randomUUID(),
    name: "Extension QA",
    email: "extension-qa@example.test",
  }));
  for (const user of users)
    await client.query("insert into public.profiles(id,name,email) values($1,$2,$3)", [
      user.id,
      user.name,
      user.email,
    ]);
  const id = "a".repeat(32),
    origin = `chrome-extension://${id}`;
  const own = await createExtensionSession(client, users[0], origin, id);
  await createExtensionSession(client, users[1], origin, id);
  await client.query(
    "update public.extension_sessions set access_expires_at=now()-interval '1 minute' where user_id=$1",
    [users[0].id],
  );
  assert.deepEqual(await getOwnExtensionConnections(client, users[0]), { sessions: 1 });
  assert.deepEqual(await disconnectOwnExtensions(client, users[0]), { sessions: 0 });
  assert.deepEqual(await getOwnExtensionConnections(client, users[0]), { sessions: 0 });
  assert.deepEqual(await getOwnExtensionConnections(client, users[1]), { sessions: 1 });
  await assert.rejects(() =>
    authenticateExtension(
      { headers: { origin, authorization: `Bearer ${own.refreshToken}` } },
      { extensionIds: id },
      client,
      "refreshExtensionSession",
    ),
  );
  console.log(
    "PASS: real SQL status, expired access, user isolation and revocation; fixtures rolled back.",
  );
} finally {
  await client.query("rollback");
  await client.end();
}
