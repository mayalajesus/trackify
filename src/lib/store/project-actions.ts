import type { Project } from "../domain";
import { nextId } from "./ids";
import type { StoreResult } from "./types";
import { normalizedProjectName } from "./validation";

export function createProjectActions({
  can,
  clients,
  projects,
  members,
  setProjects,
  setAccount,
  activeWorkspaceId,
  entries,
  timerRef,
}: {
  can: (permission: import("@/lib/permissions").Permission) => boolean;
  clients: import("@/lib/domain").Client[];
  projects: import("@/lib/domain").Project[];
  members: import("@/lib/domain").Member[];
  activeMemberId: string;
  setProjects: React.Dispatch<React.SetStateAction<import("@/lib/domain").Project[]>>;
  setAccount: React.Dispatch<React.SetStateAction<import("@/lib/account-types").PersistedAccount>>;
  activeWorkspaceId: string;
  entries: import("@/lib/domain").TimeEntry[];
  timerRef: React.RefObject<import("@/lib/store/types").TimerState>;
}) {
  const addProject = (project: Omit<Project, "id">): StoreResult => {
    if (!can("manage-projects"))
      return { success: false, error: "Only Admins and the Owner can manage projects." };
    const projectName = project.name.trim().replace(/\s+/g, " ");
    if (!projectName) return { success: false, error: "A project name is required." };
    if (!clients.some((client) => client.id === project.clientId))
      return { success: false, error: "Choose an existing client for this project." };
    if (
      projects.some(
        (current) =>
          current.clientId === project.clientId &&
          normalizedProjectName(current.name) === normalizedProjectName(projectName),
      )
    )
      return {
        success: false,
        error: "A project with this name already exists for this client.",
      };
    if (typeof project.billable !== "boolean")
      return { success: false, error: "Choose whether this project is billable." };
    if (!can("manage-project-members"))
      return { success: false, error: "You cannot assign members to projects." };
    if (
      project.memberIds.some(
        (memberId) =>
          !members.some((member) => member.id === memberId && member.status === "active"),
      )
    )
      return { success: false, error: "Only active members can be assigned to a project." };
    const createdProject: Project = {
      ...project,
      name: projectName,
      memberIds: [...new Set(project.memberIds)],
      id: nextId(
        "p",
        projects.map((current) => current.id),
      ),
    };
    setProjects((list) => [createdProject, ...list]);
    setAccount((current) => ({
      ...current,
      workspaces: current.workspaces.map((data) =>
        data.workspace.id === activeWorkspaceId
          ? { ...data, projects: [createdProject, ...data.projects] }
          : data,
      ),
    }));
    return { success: true, id: createdProject.id };
  };

  const updateProject = (id: string, patch: Partial<Omit<Project, "id">>): StoreResult => {
    if (!can("manage-projects"))
      return { success: false, error: "Only Admins and the Owner can manage projects." };
    const current = projects.find((project) => project.id === id);
    if (!current) return { success: false, error: "This project no longer exists." };
    const next = {
      ...current,
      ...patch,
      name: (patch.name ?? current.name).trim().replace(/\s+/g, " "),
    };
    if (!next.name) return { success: false, error: "A project name is required." };
    if (!clients.some((client) => client.id === next.clientId))
      return { success: false, error: "A project must keep a valid client." };
    if (
      projects.some(
        (candidate) =>
          candidate.id !== id &&
          candidate.clientId === next.clientId &&
          normalizedProjectName(candidate.name) === normalizedProjectName(next.name),
      )
    )
      return {
        success: false,
        error: "A project with this name already exists for this client.",
      };
    if (typeof next.billable !== "boolean")
      return { success: false, error: "Choose whether this project is billable." };
    if ("memberIds" in patch && !can("manage-project-members"))
      return { success: false, error: "You cannot assign members to projects." };
    if (
      next.memberIds.some(
        (memberId) =>
          !members.some((member) => member.id === memberId && member.status === "active"),
      )
    )
      return { success: false, error: "Only active members can be assigned to a project." };
    setProjects((list) => list.map((project) => (project.id === id ? next : project)));
    return { success: true };
  };

  const deleteProject = (id: string): StoreResult => {
    if (!can("manage-projects"))
      return { success: false, error: "Only Admins and the Owner can manage projects." };
    const current = projects.find((project) => project.id === id);
    if (!current) return { success: false, error: "This project no longer exists." };
    if (current.status !== "archived")
      return { success: false, error: "Archive the project before deleting it." };
    if (entries.some((entry) => entry.projectId === id))
      return {
        success: false,
        error: "This project has tracked time. Keep it archived to preserve reports and history.",
      };
    if (timerRef.current.status !== "idle")
      return { success: false, error: "Stop the active timer before deleting a project." };
    setProjects((list) => list.filter((project) => project.id !== id));
    return { success: true };
  };
  return { addProject, updateProject, deleteProject };
}
