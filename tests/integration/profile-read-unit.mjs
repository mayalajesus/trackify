import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureProfile } from "../../server/data/profile.mjs";

const user = { id: "qa-profile", name: "Auth Name", email: "qa@example.test" };
const stored = {
  name: "Custom Name",
  email: user.email,
  initials: "CN",
  auth_issuer: "neon",
  preferences_user_id: user.id,
  needs_auth_avatar: false,
};

test("initialized profile reads preserve custom data and do not write or lock rows", async () => {
  const queries = [];
  await ensureProfile(
    {
      query: async (sql) => {
        queries.push(sql);
        return { rows: [stored] };
      },
    },
    { ...user, avatarUrl: "https://example.test/auth-avatar.png" },
    { databaseProvider: "neon" },
  );
  assert.equal(queries.length, 1);
  assert.ok(queries[0].trim().startsWith("select"));
});

test("changed auth email and missing preferences still initialize safely", async () => {
  for (const previous of [
    { ...stored, email: "old@example.test" },
    { ...stored, preferences_user_id: null },
  ]) {
    const queries = [];
    await ensureProfile(
      {
        query: async (sql, args) => {
          queries.push({ sql, args });
          return { rows: sql.trim().startsWith("select") ? [previous] : [] };
        },
      },
      user,
      { databaseProvider: "neon", initialLanguage: "en-US" },
    );
    assert.ok(
      queries.some(
        ({ sql, args }) => sql.includes("insert into public.profiles") && args[3] === user.email,
      ),
    );
    assert.ok(
      queries.some(
        ({ sql, args }) =>
          sql.includes("insert into public.user_preferences") && args[1] === "en-US",
      ),
    );
  }
});

test("unchanged auth avatar does not trigger preference writes", async () => {
  let count = 0;
  await ensureProfile(
    {
      query: async () => {
        count += 1;
        return { rows: [{ ...stored, needs_auth_avatar: false }] };
      },
    },
    { ...user, avatarUrl: "https://example.test/auth-avatar.png" },
    { databaseProvider: "neon" },
  );
  assert.equal(count, 1);
});
