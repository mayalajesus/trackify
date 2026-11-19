import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import {
  cutoverContext,
  sourceRef,
  targetRef,
  projectId,
  origin,
  folder,
} from "./lib/migration-cutover-context.mjs";
import { validateConnection, collectAudit } from "./lib/supabase-migration-audit.mjs";
import { freezeWrites, verifyFreeze, releaseWrites } from "./lib/migration-write-freeze.mjs";
import { assertMigrationCandidate } from "./lib/migration-project-status.mjs";

const command = process.argv[2];
const c = await cutoverContext();
const stateName = "cutover-deployments-20261119";
const oldDeployment = "dpl_4eLCxyShnqQ4SB6gk2cwpyYunkTT";
let phase = command;
const state = () => c.recover(stateName);
async function production() {
  return c.vercel("GET", `/v9/projects/${projectId}`);
}
async function requestApp(base, route, st) {
  const r = await fetch(`${base}${route}`, {
    headers: {
      "x-vercel-protection-bypass": st.bypass,
      ...(route.includes("deep=1")
        ? { authorization: `Bearer ${st.variables.HEALTHCHECK_SECRET}` }
        : {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  return { status: r.status, text: await r.text() };
}
async function deploy(files, variables, maintenance = false) {
  let result = await c.vercel("POST", "/v13/deployments", {
    name: "watchtag",
    project: projectId,
    target: "production",
    autoAssignCustomDomains: false,
    files,
    env: variables,
    build: { env: variables },
    projectSettings: maintenance
      ? {
          framework: null,
          nodeVersion: "24.x",
          buildCommand: null,
          installCommand: "echo maintenance",
          outputDirectory: null,
        }
      : {
          framework: "vite",
          nodeVersion: "24.x",
          buildCommand: "npm run build",
          installCommand: "npm ci --ignore-scripts --no-audit --no-fund",
          outputDirectory: "dist",
        },
    meta: { supabaseCutover: targetRef, cutoverMaintenance: String(maintenance) },
  });
  console.log(JSON.stringify({ phase: "build", maintenance, id: result.id }));
  for (let n = 0; n < 100 && !["READY", "ERROR", "CANCELED"].includes(result.readyState); n++) {
    await new Promise((r) => setTimeout(r, 5000));
    result = await c.vercel("GET", `/v13/deployments/${result.id}`);
  }
  if (result.readyState !== "READY") {
    await c.preserve(`cutover-build-failure-${Date.now()}`, {
      result,
      logs: await c.vercel("GET", `/v3/deployments/${result.id}/events?limit=200&builds=1`),
    });
    throw Error("Deployment build did not become ready");
  }
  assert.equal(result.projectId, projectId);
  assert.equal(
    (await production()).targets.production.id,
    oldDeployment,
    "An unpromoted build changed production",
  );
  return { id: result.id, url: `https://${result.url}`, ready: true };
}

async function main() {
  // Historical cutover commands must never freeze the promoted production
  // database on a later rerun. A return needs its own reconciliation plan.
  assertMigrationCandidate(targetRef);
  if (command === "prepare") {
    assert.equal((await production()).targets.production.id, oldDeployment);
    const keys = await c.supabase("GET", "/api-keys");
    const key = (role) => {
      const value = keys.find((k) => k.name === role)?.api_key;
      const claims = JSON.parse(Buffer.from(value.split(".")[1], "base64url"));
      assert.equal(claims.ref, targetRef);
      assert.equal(claims.role, role);
      return value;
    };
    const database = new URL(
      validateConnection(c.migration.MIGRATION_TARGET_DATABASE_URL, targetRef),
    );
    assert.ok(database.hostname.endsWith(".pooler.supabase.com"));
    database.port = "6543";
    database.searchParams.set("sslmode", "verify-full");
    database.searchParams.set("sslrootcert", "/var/task/server/certs/supabase-ca.crt");
    const variables = {
      SUPABASE_DATABASE_URL: database.href,
      DATABASE_ENV: "production",
      DATABASE_PROVIDER: "supabase",
      SUPABASE_URL: `https://${targetRef}.supabase.co`,
      VITE_SUPABASE_URL: `https://${targetRef}.supabase.co`,
      SUPABASE_ANON_KEY: key("anon"),
      VITE_SUPABASE_PUBLISHABLE_KEY: key("anon"),
      SUPABASE_SERVICE_ROLE_KEY: key("service_role"),
      VITE_AUTH_PROVIDER: "supabase",
      VITE_APP_ENV: "production",
      APP_URL: origin,
      VITE_APP_URL: origin,
      ACCOUNT_DELETION_MAINTENANCE_PAUSED: "true",
      HEALTHCHECK_SECRET: randomBytes(32).toString("hex"),
    };
    const before = await c.vercel("GET", `/v10/projects/${projectId}/env`);
    assert.ok(
      !before.envs.some((e) => e.key === "DATABASE_URL" && e.target.includes("production")),
    );
    const rollback = {
      envs: before.envs,
      sourceValues: {
        SUPABASE_URL: c.root.SUPABASE_URL,
        VITE_SUPABASE_URL: c.root.SUPABASE_URL,
        SUPABASE_ANON_KEY: c.root.SUPABASE_ANON_KEY,
        VITE_SUPABASE_PUBLISHABLE_KEY: c.root.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: c.root.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_DATABASE_URL: c.root.SUPABASE_DATABASE_URL,
      },
    };
    try {
      await c.recover("cutover-env-rollback");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await c.preserve("cutover-env-rollback", rollback);
    }
    const bypass = randomBytes(16).toString("hex");
    await c.preserve(`cutover-bypass-${Date.now()}`, { bypass });
    await c.vercel("PATCH", `/v1/projects/${projectId}/protection-bypass`, {
      generate: { secret: bypass, note: "Authorized Supabase production cutover validation" },
    });
    const maintenanceFiles = [
      {
        file: "package.json",
        data: JSON.stringify({ name: "trackify-maintenance", private: true, type: "module" }),
      },
      {
        file: "api/maintenance.mjs",
        data: `export default function handler(req,res){res.statusCode=503;res.setHeader('cache-control','no-store');res.setHeader('retry-after','60');if(req.url.startsWith('/api/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({error:'O Trackify está em manutenção. Tente novamente em instantes.'}));return;}res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trackify</title><body style="font-family:system-ui;background:#f7f7f7;display:grid;place-items:center;min-height:90vh;margin:24px"><main style="background:white;padding:36px;border-radius:24px;max-width:460px"><h1>Voltamos em instantes</h1><p>Estamos atualizando o Trackify. Seus registros estão preservados.</p><button onclick="location.reload()" style="background:#7c3aed;color:white;border:0;border-radius:24px;padding:12px 24px;cursor:pointer">Tentar novamente</button></main></body></html>');}`,
      },
      {
        file: "vercel.json",
        data: JSON.stringify({
          builds: [{ src: "api/maintenance.mjs", use: "@vercel/node" }],
          routes: [{ src: "/(.*)", dest: "/api/maintenance.mjs" }],
        }),
      },
    ];
    phase = "prepare-maintenance";
    const maintenance = await deploy(maintenanceFiles, {}, true);
    const st = { bypass, variables };
    assert.equal((await requestApp(maintenance.url, "/login", st)).status, 503);
    phase = "prepare-application";
    const roots = new Set([
      "package.json",
      "package-lock.json",
      "index.html",
      "tsconfig.json",
      "vite.config.ts",
      "vercel.json",
    ]);
    const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", windowsHide: true })
      .split("\0")
      .filter((p) => roots.has(p) || /^(src|server|shared|public|api)\//.test(p));
    paths.push("server/certs/supabase-ca.crt");
    const files = [];
    for (const file of [...new Set(paths)].sort()) {
      assert.ok(!/(^|\/)\.env|backup\/|extension\.local|\.git\//.test(file));
      files.push({ file, data: (await readFile(file)).toString("base64"), encoding: "base64" });
    }
    const application = await deploy(files, variables);
    await c.preserve(`cutover-prepared-attempt-${application.id}`, {
      maintenance,
      application,
      bypass,
      variables,
      oldDeployment,
    });
    const health = await requestApp(application.url, "/api/health?deep=1", st);
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.text).database, "reachable");
    const page = await requestApp(application.url, "/login", st);
    assert.equal(page.status, 200);
    const scriptPaths = [...page.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(scriptPaths.length);
    let foundTarget = false;
    for (const p of scriptPaths) {
      const js = await requestApp(application.url, p, st);
      assert.equal(js.status, 200);
      assert.ok(!js.text.includes(`${sourceRef}.supabase.co`));
      foundTarget ||= js.text.includes(`${targetRef}.supabase.co`);
    }
    assert.ok(foundTarget, "Built login must use the candidate Auth URL");
    await c.preserve(stateName, {
      maintenance,
      application,
      bypass,
      variables,
      oldDeployment,
      sourceHash: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    });
    await c.evidence(stateName, {
      maintenance,
      application,
      oldDeployment,
      productionUnchanged: true,
      transactionPooler: true,
      verifiedTls: true,
      healthPassed: true,
      accountDeletionPaused: true,
    });
    console.log(
      JSON.stringify({ phase: "prepared", maintenance, application, productionUnchanged: true }),
    );
  } else if (command === "maintenance") {
    const st = await state();
    assert.equal((await production()).targets.production.id, oldDeployment);
    await c.vercel("POST", `/v10/projects/${projectId}/promote/${st.maintenance.id}`);
    await c.evidence("cutover-maintenance-entered", {
      at: new Date().toISOString(),
      deployment: st.maintenance.id,
    });
    console.log(JSON.stringify({ phase: "maintenance-promoted" }));
  } else if (["freeze-source", "freeze-target"].includes(command)) {
    const side = command.slice(7),
      d = await c.db(side);
    try {
      const present = (
        await d.query(
          "select count(*)::int as n from pg_trigger where tgname='trackify_cutover_readonly'",
        )
      ).rows[0].n;
      const result = present ? await verifyFreeze(d) : await freezeWrites(d);
      await verifyFreeze(d);
      await c.evidence(`cutover-${side}-frozen`, { at: new Date().toISOString(), ...result });
      console.log(JSON.stringify({ phase: command, ...result }));
    } finally {
      await d.end();
    }
  } else if (command === "audit-frozen") {
    for (const side of ["source", "target"]) {
      const d = await c.db(side);
      try {
        await verifyFreeze(d);
        await c.evidence(
          `cutover-${side}-frozen-audit`,
          await collectAudit(d, side === "source" ? sourceRef : targetRef),
        );
      } finally {
        await d.end();
      }
    }
    console.log(JSON.stringify({ phase: "frozen-audits-written" }));
  } else if (command === "configure") {
    const st = await state();
    const s = await c.db("source"),
      t = await c.db("target");
    try {
      await verifyFreeze(s);
      await verifyFreeze(t);
    } finally {
      await s.end();
      await t.end();
    }
    const original = await c.recover("source-service-config-20261118.json", sourceRef);
    await c.preserve("cutover-auth-before", await c.supabase("GET", "/config/auth"));
    const settings = {
      site_url: origin,
      uri_allow_list: original.auth.uri_allow_list,
      disable_signup: original.auth.disable_signup,
    };
    for (const [k, v] of Object.entries(original.auth))
      if (k.startsWith("mailer_notifications_") && k.endsWith("_enabled")) settings[k] = v;
    const auth = await c.supabase("PATCH", "/config/auth", settings);
    assert.equal(auth.site_url, origin);
    assert.equal(auth.external_google_enabled, true);
    assert.equal(auth.smtp_host, "in-v3.mailjet.com");
    const envs = (await c.vercel("GET", `/v10/projects/${projectId}/env`)).envs;
    for (const [key, value] of Object.entries(st.variables)) {
      const existing = envs.find((e) => e.key === key && e.target.includes("production"));
      if (existing)
        await c.vercel("PATCH", `/v9/projects/${projectId}/env/${existing.id}`, { value });
      else
        await c.vercel("POST", `/v10/projects/${projectId}/env`, {
          key,
          value,
          type: "sensitive",
          target: ["production"],
        });
    }
    await c.evidence("cutover-production-configured", {
      at: new Date().toISOString(),
      keys: Object.keys(st.variables),
      authOrigin: origin,
    });
    console.log(JSON.stringify({ phase: "production-configured" }));
  } else if (command === "activate") {
    const st = await state();
    await readFile(`${folder}/cutover-production-configured.json`);
    await readFile(`${folder}/cutover-final-gate.json`);
    const s = await c.db("source"),
      t = await c.db("target");
    try {
      await verifyFreeze(s);
      await releaseWrites(t);
    } finally {
      await s.end();
      await t.end();
    }
    await c.evidence("cutover-target-writable", { at: new Date().toISOString() });
    // After this boundary, rollback must preserve new target writes. Never
    // automatically unfreeze the source or point the domain at its old build.
    await c.vercel("POST", `/v10/projects/${projectId}/promote/${st.application.id}`);
    const env = await readFile(".env.migration.local", "utf8");
    await writeFile(
      ".env.migration.local",
      env.replace(/^MIGRATION_TARGET_IS_PRODUCTION=.*\r?\n?/gm, "").trimEnd() +
        "\nMIGRATION_TARGET_IS_PRODUCTION=true\n",
    );
    await c.evidence("cutover-activated", {
      at: new Date().toISOString(),
      deployment: st.application.id,
      sourceReadOnly: true,
      targetProduction: true,
    });
    console.log(JSON.stringify({ phase: "activated", origin, deployment: st.application.id }));
  } else throw Error("Unknown cutover command");
}
main().catch(async (e) => {
  await c
    .preserve(`cutover-failure-${Date.now()}`, {
      phase,
      message: e.message,
      code: e.code,
      stack: e.stack,
    })
    .catch(() => {});
  console.error(
    JSON.stringify({ phase, status: "failed", code: e.code ?? e.name, detailsEncrypted: true }),
  );
  process.exitCode = 1;
});
