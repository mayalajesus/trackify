import type { Client, Project } from "./domain";

export function projectIsBillable(
  projectId: string | null,
  projects: readonly Pick<Project, "id" | "clientId" | "billable">[],
  clients: readonly Pick<Client, "id" | "billable">[],
): boolean {
  const project = projects.find((item) => item.id === projectId);
  return Boolean(
    project && (project.billable || clients.find((item) => item.id === project.clientId)?.billable),
  );
}
