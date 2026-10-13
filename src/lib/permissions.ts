import type { Role, ProjectStatus } from "./domain";

export type Permission =
  | "track-own-time"
  | "manage-own-entries"
  | "manage-projects"
  | "manage-clients"
  | "manage-project-members"
  | "manage-members"
  | "manage-admins"
  | "view-all-reports"
  | "export-all-reports"
  | "manage-workspace-settings"
  | "manage-integrations";

export type PermissionContext = {
  sessionActive: boolean;
  memberActive: boolean;
  workspaceStatus: "active" | "archived";
};

export function hasPermission(
  role: Role | null,
  permission: Permission,
  context: PermissionContext,
): boolean {
  if (!context.sessionActive || !context.memberActive || context.workspaceStatus === "archived") {
    return false;
  }
  if (role === "Owner") return true;
  if (role === "Admin") return permission !== "manage-admins";
  return permission === "track-own-time" || permission === "manage-own-entries";
}

export function canTrackProject(
  role: Role | null,
  memberId: string | null,
  project: { status: ProjectStatus; memberIds: string[] } | null,
  context: Pick<PermissionContext, "sessionActive" | "memberActive">,
): boolean {
  if (!context.sessionActive || !context.memberActive || !project || project.status !== "active") {
    return false;
  }
  return memberId !== null && (role === "Owner" || role === "Admin" || role === "Member");
}
