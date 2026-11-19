import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { sealArchive } from "./lib/migration-archive.mjs";
import { migrationContext, targetRef } from "./lib/migration-test-context.mjs";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";

const productionId = "prj_XsV3x76RO8bbiJqkKJA5HCan6ISz";
const teamId = "team_X9Kl93Zf0PUA2aNUk0zNmhNU";
const finalOrigin = "https://watchtag.vercel.app";
const mode = process.argv[2];
assert.ok(["hosted", "definitive"].includes(mode));
const runId = randomBytes(6).toString("hex");
const projectName = `trackify-migration-app-${runId}`;
const hostOrigin = `https://${projectName}.vercel.app`;
const appOrigin = mode === "definitive" ? finalOrigin : hostOrigin;
const prefix = `backup/migration-preparation/hosted-${runId}`;
const root = parseEnv(await readFile(".env", "utf8"));
const backup = parseEnv(await readFile(".env.backup.local", "utf8"));
const evidence = {
  runId,
  mode,
  targetRef,
  appOrigin,
  hostOrigin,
  productionCutoverAuthorized: false,
};
let ctx,
  projectId,
  authBefore,
  phase = "prepare",
  failure;

async function vercel(method, endpoint, body, expected = [200, 201, 204]) {
  const response = await fetch(
    `https://api.vercel.com${endpoint}${endpoint.includes("?") ? "&" : "?"}teamId=${teamId}`,
    {
      method,
      headers: { authorization: `Bearer ${root.VERCEL_TOKEN}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!expected.includes(response.status)) {
    await preserve(prefix + ".api-failure.enc", {
      method,
      endpoint,
      status: response.status,
      error: await response.json().catch(() => null),
    }).catch(() => {});
    throw Error(`Vercel ${method}: HTTP ${response.status}`);
  }
  return response.status === 204 || response.status === 404 ? null : response.json();
}
async function authConfig(method, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/config/auth`, {
    method,
    headers: {
      authorization: `Bearer ${ctx.migration.MIGRATION_TARGET_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `Candidate Auth config ${method}`);
  return response.json();
}
async function preserve(file, value) {
  await writeFile(
    file,
    sealArchive(Buffer.from(JSON.stringify(value)), backup.BACKUP_ENCRYPTION_PASSPHRASE, targetRef),
    { flag: "wx", mode: 0o600 },
  );
}
try {
  ctx = await migrationContext();
  const production = await vercel("GET", `/v9/projects/${productionId}`);
  evidence.productionBefore = {
    deployment: production.targets?.production?.id,
    updatedAt: production.updatedAt,
  };
  const productionPage = await fetch(`${finalOrigin}/login`, {
    signal: AbortSignal.timeout(20000),
  });
  evidence.publicProductionLogin = {
    status: productionPage.status,
    htmlSha256: createHash("sha256")
      .update(await productionPage.text())
      .digest("hex"),
  };
  assert.equal(productionPage.status, 200);
  const dbUrl = new URL(validateConnection(ctx.migration.MIGRATION_TARGET_DATABASE_URL, targetRef));
  // Validate the configured candidate first. Serverless runtime uses the
  // transaction pooler; migration/backup sessions keep their original mode.
  assert.ok(dbUrl.hostname.endsWith(".pooler.supabase.com"));
  dbUrl.port = "6543";
  evidence.runtimeDatabaseMode = "transaction-pooler";
  dbUrl.searchParams.set("sslmode", "verify-full");
  dbUrl.searchParams.set("sslrootcert", "/var/task/migration-ca.crt");
  const variables = {
    DATABASE_ENV: "migration",
    DATABASE_PROVIDER: "supabase",
    DATABASE_URL: dbUrl.href,
    SUPABASE_DATABASE_URL: dbUrl.href,
    SUPABASE_URL: ctx.url,
    VITE_SUPABASE_URL: ctx.url,
    SUPABASE_SERVICE_ROLE_KEY: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: ctx.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: ctx.env.SUPABASE_ANON_KEY,
    VITE_AUTH_PROVIDER: "supabase",
    VITE_APP_ENV: "production",
    VITE_NEON_AUTH_URL: "",
    APP_URL: appOrigin,
    VITE_APP_URL: appOrigin,
    TRACKIFY_EXTENSION_IDS: ctx.env.TRACKIFY_EXTENSION_IDS,
    MAILJET_ENABLED: "false",
    MAILJET_API_KEY: "",
    MAILJET_SECRET_KEY: "",
    CRON_SECRET: "",
    SENTRY_AUTH_TOKEN: "",
    SENTRY_ORG: "",
    SENTRY_PROJECT: "",
    SENTRY_DSN: "",
    VITE_SENTRY_DSN: "",
  };
  const roots = new Set([
    "package.json",
    "package-lock.json",
    "index.html",
    "tsconfig.json",
    "vite.config.ts",
  ]);
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", windowsHide: true })
    .split("\0")
    .filter(
      (p) =>
        roots.has(p) ||
        /^(src|server|shared|public)\//.test(p) ||
        ["api/data.mjs", "api/health.mjs"].includes(p),
    );
  assert.ok(paths.length > 100);
  const files = [];
  for (const file of paths) {
    assert.ok(!/(^|\/)\.env|backup\/|extension\.local|\.git\//.test(file));
    let data = await readFile(file, "utf8");
    if (file === "vite.config.ts")
      data = data.replace(
        "build: { sourcemap:",
        'build: { rolldownOptions: { input: ["index.html", "tests/fixtures/durable-recovery.html"] }, sourcemap:',
      );
    files.push({ file, data });
  }
  for (const file of [
    "tests/fixtures/durable-recovery.html",
    "tests/fixtures/durable-recovery.tsx",
  ])
    files.push({ file, data: await readFile(file, "utf8") });
  files.push({
    file: "migration-ca.crt",
    data: await readFile("backup/migration-preparation/supabase-ca.crt", "utf8"),
  });
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  delete config.crons;
  delete config.functions["api/maintenance/account-deletions.mjs"];
  config.rewrites = config.rewrites.filter((r) => !r.source.includes("maintenance"));
  config.regions = ["iad1"];
  config.functions["api/data.mjs"].includeFiles = "migration-ca.crt";
  files.push({ file: "vercel.json", data: JSON.stringify(config) });
  evidence.source = {
    files: files.length,
    bytes: Buffer.byteLength(JSON.stringify(files)),
    sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    cronExcluded: true,
    mailDisabled: true,
  };
  await writeFile(
    prefix + ".manifest.json",
    JSON.stringify({ ...evidence.source, paths: files.map((f) => f.file) }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  phase = "create-isolated-protected-project";
  const project = await vercel("POST", "/v11/projects", {
    name: projectName,
    framework: "vite",
    buildCommand: "npm run build",
    installCommand: "npm ci --ignore-scripts --no-audit --no-fund",
    outputDirectory: "dist",
    ssoProtection: { deploymentType: "all" },
    resourceConfig: { fluid: true, functionDefaultRegions: ["iad1"] },
    environmentVariables: Object.entries(variables)
      .filter(([, v]) => v !== "")
      .map(([key, value]) => ({
        key,
        value,
        type: "sensitive",
        target: ["preview", "production"],
      })),
  });
  projectId = project.id;
  assert.notEqual(projectId, productionId);
  assert.equal(project.name, projectName);
  evidence.projectId = projectId;
  const bypass = randomBytes(16).toString("hex");
  const state = {
    projectId,
    projectName,
    targetRef,
    hostOrigin,
    appOrigin,
    bypass,
    expiresAt: Date.now() + 3600000,
  };
  await preserve(prefix + ".state.enc", state);
  await vercel("PATCH", `/v1/projects/${projectId}/protection-bypass`, {
    generate: {
      secret: bypass,
      note: "Isolated migration browser validation; delete project after validation",
    },
  });
  phase = "deploy-candidate";
  let deployment = await vercel("POST", "/v13/deployments", {
    name: projectName,
    project: projectId,
    target: "staging",
    files,
    projectSettings: {
      framework: "vite",
      nodeVersion: "24.x",
      buildCommand: "npm run build",
      installCommand: "npm ci --ignore-scripts --no-audit --no-fund",
      outputDirectory: "dist",
    },
    meta: { migrationValidation: runId },
  });
  evidence.deploymentId = deployment.id;
  console.log(
    JSON.stringify({
      phase,
      mode,
      projectId,
      deploymentId: deployment.id,
      productionChanged: false,
    }),
  );
  const deadline = Date.now() + 420000;
  while (!["READY", "ERROR", "CANCELED"].includes(deployment.readyState) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    deployment = await vercel("GET", `/v13/deployments/${deployment.id}`);
  }
  evidence.deploymentState = deployment.readyState;
  if (deployment.readyState !== "READY") {
    await preserve(prefix + ".build-failure.enc", deployment);
    const logs = await vercel("GET", `/v3/deployments/${deployment.id}/events?limit=200&builds=1`);
    await preserve(prefix + ".build-log.enc", logs);
    throw Error("Candidate build failed");
  }
  assert.equal(deployment.projectId, projectId);
  assert.ok(deployment.url.startsWith(projectName + "-") && deployment.url.endsWith(".vercel.app"));
  const protectedPage = await fetch(`${hostOrigin}/login`, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  evidence.unauthenticatedStatus = protectedPage.status;
  assert.ok([401, 403, 302, 307].includes(protectedPage.status));
  const readyPage = await fetch(`${hostOrigin}/login`, {
    headers: { "x-vercel-protection-bypass": bypass },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(readyPage.status, 200);
  phase = "configure-candidate-redirects";
  const currentAuth = await authConfig("GET");
  authBefore = { site_url: currentAuth.site_url, uri_allow_list: currentAuth.uri_allow_list };
  await preserve(prefix + ".auth-before.enc", authBefore);
  await authConfig("PATCH", {
    site_url: appOrigin,
    uri_allow_list: [
      ...new Set([
        ...String(authBefore.uri_allow_list).split(","),
        `${appOrigin}/auth/callback`,
        `${appOrigin}/auth/callback?mode=recovery`,
        `${appOrigin}/invite/accept`,
      ]),
    ]
      .filter(Boolean)
      .join(","),
  });
  phase = "browser-flows";
  const childResult = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "scripts/supabase-migration-browser-test.mjs",
        ...(process.argv.includes("--extras-only") ? ["--extras-only"] : []),
      ],
      {
        env: { ...process.env, MIGRATION_HOSTED_STATE_FILE: prefix + ".state.enc" },
        windowsHide: true,
      },
    );
    let stderr = "",
      stdout = "";
    child.stdout.on("data", (b) => {
      stdout += b;
      process.stdout.write(b);
    });
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-16000);
    });
    child.on("error", () =>
      resolve({ code: -1, stdout, stderr: "Browser process failed to start" }),
    );
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  evidence.browserExitCode = childResult.code;
  await preserve(prefix + ".browser-output.enc", childResult);
  const last = childResult.stdout.trim().split(/\r?\n/).at(-1);
  try {
    evidence.browserRunId = JSON.parse(last).runId;
  } catch {
    /* retained encrypted */
  }
  assert.equal(childResult.code, 0, "Hosted browser validation failed");
  if (mode === "hosted" && process.argv.includes("--google-check")) {
    phase = "await-google-login";
    console.log(JSON.stringify({ phase, appOrigin, runId, productionChanged: false }));
    let confirmation;
    while (!confirmation) {
      try {
        confirmation = JSON.parse(await readFile(prefix + ".google-result.json", "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!confirmation) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    assert.equal(confirmation.source, "explicit-user-confirmation");
    evidence.googleHosted = confirmation;
    assert.equal(confirmation.success, true, "Hosted Google login needs review");
  }
} catch (error) {
  failure = { phase, code: error.code ?? "HOSTED_VALIDATION_FAILED" };
  await preserve(prefix + ".failure.enc", { message: error.message }).catch(() => {});
} finally {
  if (ctx && authBefore) {
    try {
      await authConfig("PATCH", authBefore);
      const restored = await authConfig("GET");
      assert.equal(restored.site_url, authBefore.site_url);
      assert.equal(restored.uri_allow_list, authBefore.uri_allow_list);
      evidence.authRestored = true;
    } catch {
      evidence.authRestored = false;
      failure ??= { phase: "restore-candidate-auth" };
    }
  }
  if (projectId && projectId !== productionId) {
    try {
      if (evidence.deploymentState === "READY" && failure) {
        try {
          const response = await fetch(
            `https://api.vercel.com/v1/projects/${projectId}/deployments/${evidence.deploymentId}/runtime-logs?teamId=${teamId}`,
            {
              headers: { authorization: `Bearer ${root.VERCEL_TOKEN}` },
              signal: AbortSignal.timeout(10000),
            },
          );
          const reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          try {
            while (size < 1000000) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(Buffer.from(value));
              size += value.length;
            }
          } catch {
            /* Bounded stream snapshot. */
          } finally {
            await reader.cancel().catch(() => {});
          }
          await preserve(prefix + ".runtime-log.enc", {
            status: response.status,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        } catch {
          evidence.runtimeLogsUnavailable = true;
        }
      }
      const current = await vercel("GET", `/v9/projects/${projectId}`);
      assert.equal(current.name, projectName);
      await vercel("DELETE", `/v9/projects/${projectId}`);
      assert.equal(await vercel("GET", `/v9/projects/${projectId}`, null, [404]), null);
      evidence.temporaryProjectDeleted = true;
    } catch {
      evidence.temporaryProjectDeleted = false;
      failure ??= { phase: "cleanup-hosted-project" };
    }
  }
  try {
    const production = await vercel("GET", `/v9/projects/${productionId}`);
    evidence.productionAfter = {
      deployment: production.targets?.production?.id,
      updatedAt: production.updatedAt,
    };
    assert.deepEqual(evidence.productionAfter, evidence.productionBefore);
    evidence.productionUnchanged = true;
  } catch {
    evidence.productionUnchanged = false;
    failure ??= { phase: "verify-production" };
  }
  await ctx?.db.end();
  evidence.failure = failure ?? null;
  evidence.completedAt = new Date().toISOString();
  await writeFile(prefix + ".json", JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(evidence));
  if (failure) process.exitCode = 1;
}
