import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  migrationContext,
  businessFingerprint,
  verifyPreserved,
  targetRef,
} from "./lib/migration-test-context.mjs";

const allSuites = [
  "account-sync",
  "account-concurrency",
  "workspace-authorization",
  "shared-task-sync",
  "extension-timer",
  "extension-connections",
  "workspace-deletion",
  "conditional-reads",
];
const requested = process.argv.slice(2);
if (requested.some((s) => !allSuites.includes(s))) throw Error("Unknown test suite");
const suites = requested.length ? requested : allSuites;
const results = [];
const runId = randomUUID();
let ctx, before, failure, preserved;
try {
  ctx = await migrationContext();
  before = await businessFingerprint(ctx.db);
  await writeFile(`backup/migration-preparation/sql-${runId}-before.json`, JSON.stringify(before), {
    flag: "wx",
    mode: 0o600,
  });
  for (const suite of suites) {
    console.log(JSON.stringify({ suite, state: "running", targetRef }));
    const start = Date.now();
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [`tests/integration/${suite}.mjs`], {
        env: { ...process.env, ...ctx.env },
        windowsHide: true,
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (b) => {
        stdout = (stdout + b).slice(-12000);
      });
      child.stderr.on("data", (b) => {
        stderr = (stderr + b).slice(-12000);
      });
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.on("error", () => resolve({ code: -1, stdout, stderr: "spawn failure" }));
    });
    results.push({ suite, exitCode: result.code, ms: Date.now() - start });
    if (result.code !== 0) {
      await ctx.preserve(`backup/migration-preparation/sql-${runId}-failure.enc`, result);
      throw Error(`Suite failed: ${suite}`);
    }
    console.log(JSON.stringify(results.at(-1)));
  }
} catch (error) {
  failure = error.message?.startsWith("Suite failed:") ? error.message : "Validation failed";
} finally {
  if (ctx) {
    try {
      preserved = await verifyPreserved(ctx.db, before);
    } catch {
      preserved = { unchanged: false };
      failure ??= "Existing data verification failed";
    }
    await ctx.db.end();
  }
  const evidence = {
    runId,
    targetRef,
    results,
    preserved,
    failure: failure ?? null,
    productionChanged: false,
    completedAt: new Date().toISOString(),
  };
  await writeFile(
    `backup/migration-preparation/sql-tests-${runId}.json`,
    JSON.stringify(evidence, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
  if (failure) process.exitCode = 1;
}
