import { describe, expect, it } from "vitest";
import { canTrackProject, hasPermission } from "../../src/lib/permissions";

const active = { sessionActive: true, memberActive: true, workspaceStatus: "active" as const };

describe("workspace permissions", () => {
  it("allows owners everything and keeps archived workspaces read-only", () => {
    expect(hasPermission("Owner", "manage-admins", active)).toBe(true);
    expect(
      hasPermission("Owner", "manage-workspace-settings", {
        ...active,
        workspaceStatus: "archived",
      }),
    ).toBe(false);
  });

  it("restricts admins from admin role administration", () => {
    expect(hasPermission("Admin", "manage-members", active)).toBe(true);
    expect(hasPermission("Admin", "manage-admins", active)).toBe(false);
  });

  it("restricts members to their own tracking permissions", () => {
    expect(hasPermission("Member", "track-own-time", active)).toBe(true);
    expect(hasPermission("Member", "manage-projects", active)).toBe(false);
  });

  it("allows members to track every active workspace project without project assignment", () => {
    const project = { status: "active" as const, memberIds: ["u3"] };
    expect(canTrackProject("Member", "u3", project, active)).toBe(true);
    expect(canTrackProject("Member", "u2", project, active)).toBe(true);
    expect(canTrackProject("Member", "u2", { ...project, memberIds: [] }, active)).toBe(true);
    expect(canTrackProject("Admin", "u2", project, active)).toBe(true);
    expect(canTrackProject("Member", "u3", { ...project, status: "archived" }, active)).toBe(false);
    expect(canTrackProject("Member", "u3", { ...project, status: "on-hold" }, active)).toBe(false);
    expect(canTrackProject("Member", "u3", project, { ...active, memberActive: false })).toBe(
      false,
    );
    expect(canTrackProject("Member", "u3", project, { ...active, sessionActive: false })).toBe(
      false,
    );
    expect(canTrackProject(null, "u3", project, active)).toBe(false);
    expect(canTrackProject("Member", null, project, active)).toBe(false);
  });
});
