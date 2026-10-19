import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanQaData } from "../support/qa-db.mjs";

test("fixture cleanup refuses a non-QA environment before connecting", async () => {
  const previous = process.env.DATABASE_ENV;
  process.env.DATABASE_ENV = "production";
  try {
    await assert.rejects(cleanQaData("E2E safety check"), /requires DATABASE_ENV=qa/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_ENV;
    else process.env.DATABASE_ENV = previous;
  }
});

test("fixture cleanup refuses an unscoped marker before connecting", async () => {
  const previous = process.env.DATABASE_ENV;
  process.env.DATABASE_ENV = "qa";
  try {
    await assert.rejects(cleanQaData(""), /fixture marker is required/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_ENV;
    else process.env.DATABASE_ENV = previous;
  }
});
