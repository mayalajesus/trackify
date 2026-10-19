import fs from "node:fs";
import pg from "pg";

function readEnv() {
  const values = {};
  try {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  } catch {
    // CI supplies DATABASE_URL through the process environment.
  }
  return { ...values, ...process.env };
}

export async function cleanQaData(marker) {
  const env = readEnv();
  if (env.DATABASE_ENV !== "qa") throw new Error("QA cleanup requires DATABASE_ENV=qa.");
  if (!marker || !marker.startsWith("E2E ")) throw new Error("A QA fixture marker is required.");
  if (!env.DATABASE_URL) throw new Error("QA cleanup requires DATABASE_URL.");

  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const workspaceIds = (
      await client.query(
        `select distinct workspace_id
           from public.workspace_members
          where user_id in (
            select id::text
              from neon_auth."user"
             where email = any($1::text[])
          )`,
        [[env.QA_OWNER_EMAIL, env.QA_ADMIN_EMAIL, env.QA_MEMBER_EMAIL].filter(Boolean)],
      )
    ).rows.map((row) => row.workspace_id);

    if (workspaceIds.length > 0) {
      const projectIds = (
        await client.query(
          `select id
             from public.projects
            where workspace_id = any($1::uuid[])
              and name like $2`,
          [workspaceIds, `${marker}%`],
        )
      ).rows.map((row) => row.id);

      await client.query(
        `delete from public.time_entries
          where workspace_id = any($1::uuid[])
            and (task like $2 or project_id = any($3::uuid[]))`,
        [workspaceIds, `${marker}%`, projectIds],
      );
      if (projectIds.length > 0) {
        await client.query(
          `delete from public.project_members where project_id = any($1::uuid[])`,
          [projectIds],
        );
        await client.query(`delete from public.projects where id = any($1::uuid[])`, [projectIds]);
      }
      await client.query(
        `delete from public.clients
          where workspace_id = any($1::uuid[])
            and name like $2`,
        [workspaceIds, `${marker}%`],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
