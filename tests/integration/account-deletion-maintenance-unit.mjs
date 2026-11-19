import assert from "node:assert/strict";
import { test } from "node:test";
import handler from "../../api/maintenance/account-deletions.mjs";

test("paused account deletion maintenance authenticates and never opens the database", async () => {
  const keys = ["CRON_SECRET", "ACCOUNT_DELETION_MAINTENANCE_PAUSED", "DATABASE_URL"];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, {
      CRON_SECRET: "synthetic-test-secret",
      ACCOUNT_DELETION_MAINTENANCE_PAUSED: "true",
      DATABASE_URL: "invalid-must-not-connect",
    });
    const run = async (authorization) => {
      let payload;
      const response = {
        statusCode: 0,
        setHeader() {},
        end(body) {
          payload = JSON.parse(body);
        },
      };
      await handler({ method: "GET", headers: { authorization } }, response);
      return { status: response.statusCode, payload };
    };
    assert.equal((await run("Bearer incorrect")).status, 401);
    const result = await run("Bearer synthetic-test-secret");
    assert.equal(result.status, 200);
    assert.equal(result.payload.status, "paused");
    assert.equal(result.payload.selected, 0);
    assert.equal(result.payload.completed, 0);
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
});
