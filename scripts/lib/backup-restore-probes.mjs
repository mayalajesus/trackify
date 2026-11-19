import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Only called by the rehearsal after its fixed-loopback connection guard.
// Everything, including successful mutations, is rolled back together.
export async function probeRestoredAccess(db) {
  const [owner, member, admin, outsider, workspace] = Array.from({ length: 5 }, () => randomUUID());
  await db.query("BEGIN");
  try {
    for (const id of [owner, member, admin, outsider]) {
      await db.query(
        `insert into auth.users(id,email,raw_user_meta_data,aud,role)
        values($1,$2,'{"full_name":"Backup restore probe"}','authenticated','authenticated')`,
        [id, `${id}@example.invalid`],
      );
      const profile = (await db.query("select email from public.profiles where id=$1", [id]))
        .rows[0];
      assert.equal(
        profile?.email,
        `${id}@example.invalid`,
        "Auth creation trigger did not create the profile.",
      );
      assert.equal(
        (
          await db.query("select count(*)::int n from public.user_preferences where user_id=$1", [
            id,
          ])
        ).rows[0].n,
        1,
      );
    }
    await db.query("update auth.users set email=$2 where id=$1", [
      owner,
      `${owner}-updated@example.invalid`,
    ]);
    assert.equal(
      (await db.query("select email from public.profiles where id=$1", [owner])).rows[0].email,
      `${owner}-updated@example.invalid`,
      "Auth email trigger did not synchronize the profile.",
    );
    await db.query(
      "insert into public.workspaces(id,name,owner_id) values($1,'Backup restore probe',$2)",
      [workspace, owner],
    );
    for (const [id, role] of [
      [owner, "Owner"],
      [member, "Member"],
      [admin, "Admin"],
    ])
      await db.query(
        "insert into public.workspace_members(workspace_id,user_id,role,status) values($1,$2,$3,'active')",
        [workspace, id, role],
      );

    async function asUser(id, role = "authenticated") {
      await db.query("RESET ROLE");
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: id ?? "", role }),
      ]);
      await db.query(role === "anon" ? "SET LOCAL ROLE anon" : "SET LOCAL ROLE authenticated");
    }
    async function deniedInsert(bucket, name) {
      await db.query("SAVEPOINT denied_write");
      let denied = false;
      try {
        await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [bucket, name]);
      } catch (error) {
        if (error.code !== "42501") throw error;
        denied = true;
      } finally {
        await db.query("ROLLBACK TO SAVEPOINT denied_write");
        await db.query("RELEASE SAVEPOINT denied_write");
      }
      assert.ok(denied, "Storage accepted an unauthorized insert.");
    }
    async function visible(bucket, name) {
      return (
        await db.query("select id from storage.objects where bucket_id=$1 and name=$2", [
          bucket,
          name,
        ])
      ).rowCount;
    }
    const avatar = `${owner}/backup-probe.png`,
      logo = `${workspace}/backup-probe.png`;
    await asUser(owner);
    for (const [bucket, name] of [
      ["avatars", avatar],
      ["workspace-logos", logo],
    ]) {
      await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [bucket, name]);
      assert.equal(await visible(bucket, name), 1);
      assert.equal(
        (
          await db.query(
            "update storage.objects set metadata='{}' where bucket_id=$1 and name=$2",
            [bucket, name],
          )
        ).rowCount,
        1,
      );
    }
    for (const id of [member, admin]) {
      await asUser(id);
      for (const [bucket, name] of [
        ["avatars", avatar],
        ["workspace-logos", logo],
      ]) {
        assert.equal(await visible(bucket, name), 1, "Workspace members must see shared images.");
        assert.equal(
          (
            await db.query(
              "update storage.objects set metadata='{}' where bucket_id=$1 and name=$2",
              [bucket, name],
            )
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await db.query("delete from storage.objects where bucket_id=$1 and name=$2", [
              bucket,
              name,
            ])
          ).rowCount,
          0,
        );
        await deniedInsert(bucket, name.replace(".png", `-${id}.png`));
      }
    }
    for (const [id, role] of [
      [outsider, "authenticated"],
      [null, "anon"],
    ]) {
      await asUser(id, role);
      for (const [bucket, name] of [
        ["avatars", avatar],
        ["workspace-logos", logo],
      ]) {
        assert.equal(await visible(bucket, name), 0, "Images leaked outside the workspace.");
        await deniedInsert(bucket, name.replace(".png", "-unauthorized.png"));
      }
    }
    await asUser(owner);
    // UPDATE must also prevent moving an owned object into another user's namespace.
    await db.query("SAVEPOINT forbidden_move");
    let moveDenied = false;
    try {
      await db.query("update storage.objects set name=$2 where bucket_id='avatars' and name=$1", [
        avatar,
        `${outsider}/moved.png`,
      ]);
    } catch (error) {
      if (error.code !== "42501") throw error;
      moveDenied = true;
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT forbidden_move");
      await db.query("RELEASE SAVEPOINT forbidden_move");
    }
    assert.ok(moveDenied, "Avatar UPDATE bypassed its ownership check.");
    for (const [bucket, name] of [
      ["avatars", avatar],
      ["workspace-logos", logo],
    ])
      assert.equal(
        (
          await db.query("delete from storage.objects where bucket_id=$1 and name=$2", [
            bucket,
            name,
          ])
        ).rowCount,
        1,
      );
    return {
      authTriggers: 2,
      imageAccess: "owner/member/admin/outsider/anonymous",
      rolledBack: true,
    };
  } finally {
    await db.query("ROLLBACK");
  }
}
