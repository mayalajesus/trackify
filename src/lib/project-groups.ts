import type { Client, Project } from "./domain";

export function groupProjectsByClient(
  projects: readonly Project[],
  clients: readonly Client[],
  locale: string,
  unknownClient: string,
) {
  const names = new Map(clients.map((client) => [client.id, client.name]));
  const groups = new Map<string, { id: string; name: string; projects: Project[] }>();
  for (const project of projects) {
    let group = groups.get(project.clientId);
    if (!group) {
      group = {
        id: project.clientId,
        name: names.get(project.clientId) ?? unknownClient,
        projects: [],
      };
      groups.set(project.clientId, group);
    }
    group.projects.push(project);
  }
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return [...groups.values()].sort((a, b) => collator.compare(a.name.trim(), b.name.trim()));
}
