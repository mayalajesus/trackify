import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Clock } from "@gravity-ui/icons";
import { BillableIndicator } from "@/components/billable-indicator";
import { EntriesTable } from "@/components/entries-table";
import { ProjectLabel } from "@/components/project-color";
import { RouterLink } from "@/components/router-link";
import { PageHeader, StatCard } from "@/components/page-header";
import { EmptyBlock } from "@/components/states";
import { formatDate, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project details — Trackify" },
      { name: "description", content: "Hours, members and entries tracked for this project." },
      { property: "og:title", content: "Project details — Trackify" },
      { property: "og:description", content: "Breakdown of tracked time for a single project." },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { projects, clients, entries, members } = useStore();
  const { locale, t } = useI18n();

  const project = projects.find((p) => p.id === projectId);
  const projectEntries = entries.filter((e) => e.projectId === projectId);
  const total = projectEntries.reduce((sum, e) => sum + e.seconds, 0);
  const billable = projectEntries.filter((e) => e.billable).reduce((sum, e) => sum + e.seconds, 0);

  if (!project) {
    return (
      <EmptyBlock
        icon={<Clock className="size-5" />}
        title={t("Project not found")}
        description={t("This project may have been archived or removed.")}
        action={
          <RouterLink to="/projects">
            <Button size="sm" variant="secondary">
              {t("Back to projects")}
            </Button>
          </RouterLink>
        }
      />
    );
  }

  const client = clients.find((c) => c.id === project.clientId);
  const team = members.filter((m) => project.memberIds.includes(m.id));

  return (
    <div className="space-y-6">
      <RouterLink to="/projects" className="inline-flex items-center gap-1">
        <ArrowLeft className="size-4" />
        {t("Projects")}
      </RouterLink>

      <PageHeader
        title={<ProjectLabel project={project} label={project.name} size="lg" weight="semibold" />}
        description={t("{client} · updated {date}", {
          client: client?.name ?? t("No client"),
          date: formatDate(project.lastActivity, locale),
        })}
        actions={
          <div className="flex items-center gap-2">
            <Chip size="sm" variant="secondary" color="default">
              {t(
                project.status === "on-hold"
                  ? "Inactive"
                  : project.status === "archived"
                    ? "Archived"
                    : "Active",
              )}
            </Chip>
            <BillableIndicator billable={project.billable} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Total tracked")} value={formatDuration(total, locale)} />
        <StatCard label={t("Billable")} value={formatDuration(billable, locale)} />
        <StatCard
          label={t("Members")}
          value={String(team.length)}
          hint={team.map((m) => m.name).join(", ")}
        />
      </div>

      {projectEntries.length === 0 ? (
        <EmptyBlock
          icon={<Clock className="size-5" />}
          title={t("No time tracked")}
          description={t("Entries logged against this project will appear here.")}
        />
      ) : (
        <EntriesTable entries={projectEntries} showDate showMember />
      )}
    </div>
  );
}
