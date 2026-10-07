import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argumentValue(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function sqlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

function checksum(sql) {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n")).digest("hex");
}

// Commit 08c9dcc restored the original advisory-lock prefix in these files.
// Some QA databases had already applied its parent's versions. Accept only
// these audited pairs; retain the recorded checksums and reject any new drift.
const historicalChecksums = new Map([
  [
    "common/20260831090000_active_personal_workspace.sql",
    {
      current: "3bc3f2e17d2543a933aff91137eeac4be2e4e6340585a85e3d4e85108ab95528",
      applied: "39fb878cb17232cd977d68c8040ea0a519a6a9a9df6cf5f4b7931211818f4e42",
    },
  ],
  [
    "common/20260831092000_personal_owner_workspace.sql",
    {
      current: "23058054cc3ec7b7297a44f688af05272d01b229d97c62b1a21352e38d8c4787",
      applied: "210005a134786cbc2d443277e2d4fe4fbc3bcd0096453449c8e80770dbc7ed01",
    },
  ],
]);

async function migrationPlan(provider) {
  const plan = (await sqlFiles(path.join(root, "db", "migrations"))).map((file) => ({
    scope: "common",
    file,
  }));
  if (provider === "supabase") {
    const providerFiles = await sqlFiles(path.join(root, "db", "providers", "supabase"));
    plan.push(...providerFiles.map((file) => ({ scope: "supabase", file })));
  }
  return plan;
}

async function migrate(client, provider, dryRun) {
  const plan = await migrationPlan(provider);
  if (dryRun) {
    for (const migration of plan) {
      process.stdout.write(`${migration.scope}/${path.basename(migration.file)}\n`);
    }
    return;
  }

  await client.query(`
    create table if not exists public.schema_migrations (
      scope text not null,
      filename text not null,
      checksum text not null,
      applied_at timestamptz not null default now(),
      primary key (scope, filename)
    )
  `);

  for (const migration of plan) {
    const filename = path.basename(migration.file);
    const sql = await readFile(migration.file, "utf8");
    const digest = checksum(sql);
    const applied = await client.query(
      `select checksum from public.schema_migrations where scope = $1 and filename = $2`,
      [migration.scope, filename],
    );

    if (applied.rowCount) {
      const historical = historicalChecksums.get(`${migration.scope}/${filename}`);
      const knownHistoricalVersion =
        historical?.current === digest && historical.applied === applied.rows[0].checksum;
      if (applied.rows[0].checksum !== digest && !knownHistoricalVersion) {
        throw new Error(
          `Migration ${migration.scope}/${filename} changed after it was applied. Add a new migration instead.`,
        );
      }
      process.stdout.write(
        `skip ${migration.scope}/${filename}${knownHistoricalVersion ? " (verified historical version)" : ""}\n`,
      );
      continue;
    }

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        `insert into public.schema_migrations (scope, filename, checksum) values ($1, $2, $3)`,
        [migration.scope, filename, digest],
      );
      await client.query("commit");
      process.stdout.write(`apply ${migration.scope}/${filename}\n`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
}

async function seedQa(client) {
  if (process.env.DATABASE_ENV !== "qa") {
    throw new Error("QA seeds require DATABASE_ENV=qa.");
  }

  const files = await sqlFiles(path.join(root, "db", "seeds", "qa"));
  await client.query("begin");
  try {
    await client.query("select set_config('app.environment', 'qa', true)");
    for (const file of files) {
      await client.query(await readFile(file, "utf8"));
      process.stdout.write(`seed qa/${path.basename(file)}\n`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  const command = process.argv[2];
  const provider = argumentValue("provider") ?? process.env.DATABASE_PROVIDER;
  const dryRun = process.argv.includes("--dry-run");

  if (command === "migrate" && provider !== "neon" && provider !== "supabase") {
    throw new Error("Choose DATABASE_PROVIDER=neon or DATABASE_PROVIDER=supabase.");
  }
  if (command !== "migrate" && !(command === "seed" && process.argv[3] === "qa")) {
    throw new Error("Use `migrate --provider neon|supabase` or `seed qa`.");
  }
  if (command === "seed" && process.env.DATABASE_ENV !== "qa") {
    throw new Error("QA seeds require DATABASE_ENV=qa.");
  }

  if (dryRun) {
    await migrate(null, provider, true);
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const client = new Client({ connectionString, application_name: "trackify-migrations" });
  await client.connect();
  try {
    if (command === "migrate") await migrate(client, provider, false);
    else await seedQa(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
