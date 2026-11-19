import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { sealArchive } from "./lib/migration-archive.mjs";
import { validateConnection } from "./lib/supabase-migration-audit.mjs";

const sourceProject = "prj_XsV3x76RO8bbiJqkKJA5HCan6ISz",
  targetRef = "gfedmrhckghmgssgfwis";
const teamId = "team_X9Kl93Zf0PUA2aNUk0zNmhNU";
let phase = "prepare",
  projectId;
async function main() {
  const env = parseEnv(await readFile(".env", "utf8"));
  const migration = parseEnv(await readFile(".env.migration.local", "utf8"));
  const backup = parseEnv(await readFile(".env.backup.local", "utf8"));
  const runId = randomBytes(6).toString("hex"),
    name = `trackify-migration-check-${runId}`;
  const output = `backup/migration-preparation/cloud-probe-${runId}`;
  const token = randomBytes(32).toString("hex"),
    bypass = randomBytes(16).toString("hex");
  const dbUrl = validateConnection(migration.MIGRATION_TARGET_DATABASE_URL, targetRef);
  const ca = await readFile("backup/migration-preparation/supabase-ca.crt", "utf8");
  const request = async (method, endpoint, body) => {
    const r = await fetch(
      `https://api.vercel.com${endpoint}${endpoint.includes("?") ? "&" : "?"}teamId=${teamId}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${env.VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!r.ok) {
      const error = await r.json().catch(() => ({}));
      const code = error.error?.code;
      throw Object.assign(new Error("Vercel request failed"), {
        status: r.status,
        code: /^[a-zA-Z0-9_-]{1,100}$/.test(code ?? "") ? code : "API_REJECTED",
      });
    }
    return r.status === 204 ? null : r.json();
  };
  const productionBefore = await request("GET", `/v9/projects/${sourceProject}`);
  const handler = `import pg from 'pg';
const pools=new Map();
export default async function handler(req,res){
res.setHeader('cache-control','no-store');
if(req.method!=='POST'||req.headers.authorization!=='Bearer '+process.env.PROBE_TOKEN||Date.now()>Number(process.env.PROBE_EXPIRES_AT))return res.status(401).json({error:'unauthorized'});
const mode=req.body?.mode;if(!['session','transaction'].includes(mode))return res.status(400).json({error:'mode'});
let client;let step='connect';const start=performance.now();
try {const url=new URL(process.env.MIGRATION_PROBE_DATABASE_URL);if(url.hostname!=='aws-0-us-west-2.pooler.supabase.com'||url.username!=='postgres.${targetRef}')throw Error('identity');url.port=mode==='session'?'5432':'6543';
let pool=pools.get(mode);if(!pool){pool=new pg.Pool({connectionString:url.href,ssl:{ca:process.env.MIGRATION_PROBE_CA,rejectUnauthorized:true},max:5,connectionTimeoutMillis:10000,query_timeout:15000,idleTimeoutMillis:30000});pool.on('error',()=>{});pools.set(mode,pool);}
client=await pool.connect();step='read';const connectMs=Math.round(performance.now()-start);await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
await client.query("SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='3s'");
const counts=(await client.query('select (select count(*)::int from public.profiles) as users,(select count(*)::int from public.time_entries) as entries,(select count(*)::int from public.workspaces) as workspaces')).rows[0];
const samples=[];for(let i=0;i<5;i++){const t=performance.now();await client.query('select count(*) from public.time_entries where date >= $1 and date <= $2',['2026-11-01','2026-11-30']);samples.push(Math.round(performance.now()-t));}
await client.query('ROLLBACK');client.release();client=null;return res.status(200).json({mode,region:process.env.VERCEL_REGION,connectMs,totalMs:Math.round(performance.now()-start),queryMs:samples,counts,readOnly:true});
}catch(error){client?.release(true);return res.status(503).json({mode,ok:false,step,code:/^[A-Z0-9_]{2,40}$/.test(error.code??'')?error.code:'PROBE_FAILED',totalMs:Math.round(performance.now()-start)});}}
`;
  const files = [
    { file: "api/probe.js", data: handler },
    {
      file: "package.json",
      data: JSON.stringify({
        private: true,
        type: "module",
        engines: { node: "24.x" },
        dependencies: { pg: "8.23.0" },
      }),
    },
    {
      file: "public/index.html",
      data: "<!doctype html><title>Migration validation</title>Private temporary connectivity check.",
    },
    {
      file: "vercel.json",
      data: JSON.stringify({
        version: 2,
        regions: ["iad1"],
        functions: { "api/probe.js": { maxDuration: 60 } },
      }),
    },
  ];
  const evidence = {
    runId,
    name,
    targetRef,
    productionDeploymentBefore: productionBefore.targets?.production?.id,
    checks: [],
    productionCutoverAuthorized: false,
  };
  let failure;
  try {
    phase = "create-private-temporary-project";
    const variables = {
      MIGRATION_PROBE_DATABASE_URL: dbUrl,
      MIGRATION_PROBE_CA: ca,
      PROBE_TOKEN: token,
      PROBE_EXPIRES_AT: String(Date.now() + 3600000),
    };
    const project = await request("POST", "/v11/projects", {
      name,
      framework: null,
      buildCommand: "",
      installCommand: "npm install --ignore-scripts --no-audit --no-fund",
      outputDirectory: "public",
      ssoProtection: { deploymentType: "all_except_custom_domains" },
      resourceConfig: { fluid: true, functionDefaultRegions: ["iad1"] },
      environmentVariables: Object.entries(variables).map(([key, value]) => ({
        key,
        value,
        type: "sensitive",
        // Vercel labels the very first deployment of a new project as production.
        // Both scopes belong exclusively to this temporary project, never the app.
        target: ["preview", "production"],
      })),
    });
    projectId = project.id;
    if (projectId === sourceProject || project.name !== name)
      throw Error("Project identity mismatch");
    evidence.projectId = projectId;
    await writeFile(
      output + ".state.enc",
      sealArchive(
        Buffer.from(JSON.stringify({ projectId, name, token, bypass, teamId })),
        backup.BACKUP_ENCRYPTION_PASSPHRASE,
        targetRef,
      ),
      { flag: "wx", mode: 0o600 },
    );
    await request("PATCH", `/v1/projects/${projectId}/protection-bypass`, {
      generate: {
        secret: bypass,
        note: "Temporary isolated migration check; revoked with project cleanup",
      },
    });
    phase = "deploy-isolated-probe";
    let deployment = await request("POST", "/v13/deployments", {
      name,
      project: projectId,
      target: "staging",
      files,
      projectSettings: {
        framework: null,
        nodeVersion: "24.x",
        buildCommand: "",
        installCommand: "npm install --ignore-scripts --no-audit --no-fund",
        outputDirectory: "public",
      },
      meta: { migrationValidation: runId },
    });
    evidence.deploymentId = deployment.id;
    console.log(
      JSON.stringify({ phase, projectId, deploymentId: deployment.id, productionChanged: false }),
    );
    const deadline = Date.now() + 300000;
    while (
      !["READY", "ERROR", "CANCELED"].includes(deployment.readyState) &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 5000));
      deployment = await request("GET", `/v13/deployments/${deployment.id}`);
    }
    evidence.deploymentState = deployment.readyState;
    evidence.deploymentTarget = deployment.target;
    evidence.deploymentErrorCode = deployment.errorCode ?? null;
    if (deployment.errorMessage) {
      let message = String(deployment.errorMessage);
      for (const secret of [dbUrl, token, bypass, env.VERCEL_TOKEN])
        message = message.replaceAll(secret, "[redacted]");
      evidence.deploymentErrorMessage = message.slice(0, 300);
    }
    if (
      deployment.readyState !== "READY" ||
      deployment.projectId !== projectId ||
      !deployment.url?.startsWith(name + "-") ||
      !deployment.url.endsWith(".vercel.app")
    )
      throw Object.assign(new Error("Isolated deployment identity mismatch"), {
        code: "DEPLOYMENT_IDENTITY_MISMATCH",
      });
    phase = "probe-runtime";
    const endpoint = `https://${deployment.url}/api/probe`;
    const unauthorized = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "session" }),
      signal: AbortSignal.timeout(20000),
    });
    if (![401, 403, 302, 307].includes(unauthorized.status))
      throw Error("Deployment protection missing");
    evidence.unauthenticatedStatus = unauthorized.status;
    const withoutProbeToken = await fetch(endpoint, {
      method: "POST",
      headers: { "x-vercel-protection-bypass": bypass, "content-type": "application/json" },
      body: JSON.stringify({ mode: "session" }),
      signal: AbortSignal.timeout(20000),
    });
    evidence.withoutProbeTokenStatus = withoutProbeToken.status;
    if (withoutProbeToken.status !== 401) throw Error("Probe authentication missing");
    for (const mode of ["session", "transaction"])
      for (let i = 0; i < 3; i++) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "x-vercel-protection-bypass": bypass,
            "content-type": "application/json",
          },
          body: JSON.stringify({ mode }),
          signal: AbortSignal.timeout(55000),
        });
        const data = await response.json();
        evidence.checks.push({ status: response.status, ...data });
        if (
          response.status !== 200 ||
          data.region !== "iad1" ||
          data.counts?.users !== 16 ||
          data.counts?.entries !== 1064 ||
          data.counts?.workspaces !== 11 ||
          data.readOnly !== true
        )
          throw Error("Runtime validation failed");
      }
  } catch (e) {
    failure = { phase, status: e.status ?? null, code: e.code ?? null };
  } finally {
    if (projectId && projectId !== sourceProject) {
      try {
        phase = "cleanup-temporary-project";
        const project = await request("GET", `/v9/projects/${projectId}`);
        if (project.name !== name) {
          evidence.temporaryProjectDeleted = false;
          failure ??= { phase, reason: "cleanup-identity-mismatch" };
        } else {
          await request("DELETE", `/v9/projects/${projectId}`);
          evidence.temporaryProjectDeleted = true;
        }
      } catch {
        evidence.temporaryProjectDeleted = false;
        failure ??= { phase };
      }
    }
    const productionAfter = await request("GET", `/v9/projects/${sourceProject}`);
    evidence.productionDeploymentAfter = productionAfter.targets?.production?.id;
    evidence.productionUnchanged =
      evidence.productionDeploymentBefore === evidence.productionDeploymentAfter &&
      JSON.stringify(productionBefore.ssoProtection) ===
        JSON.stringify(productionAfter.ssoProtection) &&
      productionBefore.serverlessFunctionRegion === productionAfter.serverlessFunctionRegion;
  }
  evidence.failure = failure ?? null;
  evidence.completedAt = new Date().toISOString();
  await writeFile(output + ".json", JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(evidence));
  if (failure || !evidence.productionUnchanged) process.exitCode = 1;
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      error: "Isolated cloud probe needs review",
      phase,
      projectId,
      status: e.status ?? null,
    }),
  );
  process.exitCode = 1;
});
