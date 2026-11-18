import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT, jwtVerify } from "jose";
import { authenticateDataRequest } from "../../server/authentication.mjs";

test("Supabase verifies real signatures with cached public keys and live session checks", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "qa-key", alg: "ES256", use: "sig" };
  const secret = new TextEncoder().encode("qa-only-legacy-key-not-a-production-secret");
  let keys = 0,
    users = 0,
    unavailable = false;
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "qa@example.test",
    email_confirmed_at: "2026-01-01",
    user_metadata: { name: "QA User" },
  };
  let row = user;
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: row ? [row] : [] };
    },
  };
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url.endsWith("jwks.json")) {
      keys++;
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    users++;
    if (unavailable) {
      res.statusCode = 402;
      res.end("{}");
      return;
    }
    try {
      await jwtVerify(req.headers.authorization.slice(7), secret);
      res.end(JSON.stringify(user));
    } catch {
      res.statusCode = 401;
      res.end("{}");
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const issuer = `${origin}/auth/v1`;
  const config = {
    databaseProvider: "supabase",
    supabaseUrl: origin,
    supabasePublishableKey: "qa-public",
  };
  const sign = (claims = {}, alg = "ES256") =>
    new SignJWT({
      role: "authenticated",
      session_id: "22222222-2222-4222-8222-222222222222",
      ...claims,
    })
      .setProtectedHeader({ alg, kid: "qa-key" })
      .setSubject(user.id)
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(alg === "HS256" ? secret : privateKey);
  const authenticate = (token) =>
    authenticateDataRequest({ headers: { authorization: `Bearer ${token}` } }, config, () => pool);
  try {
    const token = await sign();
    assert.equal((await authenticate(token)).id, user.id);
    assert.equal((await authenticate(token)).id, user.id);
    assert.equal(keys, 1);
    assert.equal(users, 0);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].params, [user.id, "22222222-2222-4222-8222-222222222222"]);
    row = null;
    await assert.rejects(authenticate(token), { status: 401 });
    row = { ...user, banned: true };
    await assert.rejects(authenticate(token), { status: 403 });
    row = { ...user, email_confirmed_at: null };
    await assert.rejects(authenticate(token), { status: 403 });
    row = user;
    await assert.rejects(authenticate(await sign({ role: "service_role" })), { status: 401 });
    await assert.rejects(authenticate(await sign({ session_id: "invalid" })), { status: 401 });
    const invalid = await new SignJWT({
      session_id: "22222222-2222-4222-8222-222222222222",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "ES256", kid: "qa-key" })
      .setSubject(user.id)
      .setIssuer("https://other.example")
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    await assert.rejects(authenticate(invalid), { status: 401 });
    const legacy = await sign({}, "HS256");
    assert.equal((await authenticate(legacy)).id, user.id);
    unavailable = true;
    await assert.rejects(authenticate(legacy), {
      status: 503,
      code: "auth_verification_unavailable",
    });
  } finally {
    await new Promise((done) => server.close(done));
  }
});
