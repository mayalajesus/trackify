import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createReturnPlan, returnPlanSql } from "./migration-return-plan.mjs";

// Only runs inside the network-less tmpfs container created by restore-rehearsal.
export function exerciseReturn({ docker, name, verification }) {
  assert.match(name, /^trackify-migration-rehearsal-[a-f0-9-]+$/);
  const psql = (database, sql) =>
    docker(
      [
        "exec",
        "-i",
        name,
        "psql",
        "-X",
        "-q",
        "-A",
        "-t",
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: Buffer.from(sql), timeout: 60000 },
    ).toString();
  const ids = Array.from({ length: 9 }, () => randomUUID());
  const [owner, workspace, client, project, editId, deleteId, newId, newUser, invitation] = ids;
  psql(
    "postgres",
    `BEGIN;
    INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data) VALUES('${owner}','return-${owner}@example.invalid',extensions.crypt('before-test',extensions.gen_salt('bf')), '{"full_name":"Return rehearsal"}');
    INSERT INTO public.workspaces(id,name,owner_id) VALUES('${workspace}','Return rehearsal','${owner}');
    INSERT INTO public.clients(id,workspace_id,name) VALUES('${client}','${workspace}','Before return');
    INSERT INTO public.projects(id,workspace_id,client_id,name) VALUES('${project}','${workspace}','${client}','Return project');
    INSERT INTO public.time_entries(id,workspace_id,user_id,project_id,task,date,start_time,end_time,end_date,duration_seconds)
      VALUES('${editId}','${workspace}','${owner}','${project}','Before edit','2026-11-19','09:00','10:00','2026-11-19',3600),
      ('${deleteId}','${workspace}','${owner}','${project}','Will be deleted','2026-11-19','10:00','11:00','2026-11-19',3600);
    INSERT INTO public.workspace_invitations(id,workspace_id,email,role,invited_by) VALUES('${invitation}','${workspace}','return-invite@example.invalid','Member','${owner}');COMMIT;`,
  );
  docker(["exec", name, "createdb", "-U", "postgres", "-T", "postgres", "return_baseline"]);
  const tableRows = (database) =>
    JSON.parse(psql(database, "select coalesce(json_agg(t),'[]') from public.time_entries t"));
  const baseline = tableRows("return_baseline");
  psql(
    "postgres",
    `BEGIN;
    UPDATE public.clients SET name='Changed after migration' WHERE id='${client}';
    UPDATE public.time_entries SET task='Changed after migration',description='Preserved note' WHERE id='${editId}';
    DELETE FROM public.time_entries WHERE id='${deleteId}';
    INSERT INTO public.time_entries(id,workspace_id,user_id,project_id,task,date,start_time,end_time,end_date,duration_seconds)
      VALUES('${newId}','${workspace}','${owner}','${project}','Created after migration','2026-11-19','11:00','11:15','2026-11-19',900);
    UPDATE auth.users SET encrypted_password=extensions.crypt('after-test',extensions.gen_salt('bf')) WHERE id='${owner}';
    INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data) VALUES('${newUser}','return-${newUser}@example.invalid',extensions.crypt('new-test',extensions.gen_salt('bf')),'{"full_name":"Created after migration"}');
    UPDATE public.workspace_invitations SET status='cancelled' WHERE id='${invitation}';COMMIT;`,
  );
  const current = tableRows("postgres");
  const writable = JSON.parse(
    psql(
      "postgres",
      "select json_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='time_entries' and is_generated='NEVER'",
    ),
  );
  const plan = createReturnPlan([
    {
      schema: "public",
      name: "time_entries",
      keys: ["id"],
      columns: writable,
      baseline,
      current,
      returning: baseline,
    },
  ]);
  assert.deepEqual(plan.summary, { inserts: 1, updates: 1, deletes: 1 });
  psql("return_baseline", returnPlanSql(plan));
  assert.deepEqual(
    tableRows("return_baseline").sort((a, b) => a.id.localeCompare(b.id)),
    current.sort((a, b) => a.id.localeCompare(b.id)),
  );
  let stalePlanRejected = false;
  try {
    psql("return_baseline", returnPlanSql(plan));
  } catch {
    stalePlanRejected = true;
  }
  assert.equal(stalePlanRejected, true);
  // A complete return uses the CURRENT source of truth, never the old snapshot.
  const dump = docker(
    ["exec", name, "pg_dump", "-U", "postgres", "-d", "postgres", "--format=custom"],
    { timeout: 60000 },
  );
  docker(["exec", name, "createdb", "-U", "postgres", "return_candidate"]);
  try {
    docker(
      [
        "exec",
        "-i",
        name,
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        "return_candidate",
        "--clean",
        "--if-exists",
        "--exit-on-error",
        "--single-transaction",
      ],
      { input: dump, timeout: 120000 },
    );
  } finally {
    dump.fill(0);
  }
  const source = JSON.parse(psql("postgres", verification)),
    returned = JSON.parse(psql("return_candidate", verification));
  assert.deepEqual(returned, source, "Complete return must preserve every restored record");
  const result = JSON.parse(
    psql(
      "return_candidate",
      `select json_build_object(
    'newEntry',exists(select 1 from public.time_entries where id='${newId}'),
    'editPreserved',exists(select 1 from public.time_entries where id='${editId}' and task='Changed after migration' and description='Preserved note'),
    'deletionPreserved',not exists(select 1 from public.time_entries where id='${deleteId}'),
    'newAccount',exists(select 1 from auth.users where id='${newUser}'),
    'passwordPreserved',exists(select 1 from auth.users where id='${owner}' and encrypted_password=extensions.crypt('after-test',encrypted_password)),
    'invitationCancellation',exists(select 1 from public.workspace_invitations where id='${invitation}' and status='cancelled'))`,
    ),
  );
  assert.ok(Object.values(result).every((v) => v === true));
  return {
    ...result,
    fullTablesCompared: source.length,
    stalePlanRejected,
    transactionalEntryReconciliation: plan.summary,
    returnedDataDigest: createHash("sha256").update(JSON.stringify(returned)).digest("hex"),
    network: "none",
    productionChanged: false,
    limitation:
      "Offline PostgreSQL return. Hosted Auth sessions, Storage byte re-upload, permissions and SMTP must be validated again on the selected return project before switching traffic.",
  };
}
