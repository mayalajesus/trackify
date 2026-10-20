import assert from "node:assert/strict";
import { test } from "node:test";
import { createQaClient } from "../support/qa-fixtures.mjs";

test("SQL fixtures refuse production, missing connections and non-QA providers", () => {
  const keys = ["DATABASE_ENV", "DATABASE_PROVIDER", "DATABASE_URL"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    const allowed = {
      DATABASE_ENV: "qa",
      DATABASE_PROVIDER: "neon",
      DATABASE_URL: "postgresql://fixture:fixture@isolated.neon.tech/qa",
    };
    for (const override of [
      { DATABASE_ENV: "production" },
      { DATABASE_PROVIDER: "supabase" },
      { DATABASE_URL: "postgresql://fixture:fixture@db.supabase.co/postgres" },
      { DATABASE_URL: "" },
    ]) {
      Object.assign(process.env, allowed, override);
      assert.throws(() => createQaClient("guard"), /QA Neon database/);
    }
    Object.assign(process.env, allowed);
    assert.equal(
      createQaClient("guard").connectionParameters.application_name,
      "trackify-qa-guard",
    );
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
