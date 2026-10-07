import { Card } from "@heroui/react/card";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextField } from "@heroui/react/textfield";
import { Typography } from "@heroui/react/typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Magnifier } from "@gravity-ui/icons";
import { PageHeader } from "@/components/page-header";
import { ProjectLabel } from "@/components/project-color";
import { RouterLink } from "@/components/router-link";
import { EmptyBlock } from "@/components/states";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Search — Trackify" },
      { name: "description", content: "Search projects, clients, teammates and time entries." },
      { property: "og:title", content: "Search — Trackify" },
      { property: "og:description", content: "Find anything in your workspace." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const { projects, clients, members, entries } = useStore();
  const { t } = useI18n();
  const term = q.trim().toLowerCase();

  const match = (value: string) => term.length > 0 && value.toLowerCase().includes(term);
  const p = projects.filter((x) => match(x.name));
  const c = clients.filter((x) => match(x.name));
  const m = members.filter((x) => match(x.name) || match(x.email));
  const e = entries.filter((x) => {
    const projectName =
      x.projectId === null
        ? t("No project")
        : (projects.find((p) => p.id === x.projectId)?.name ?? "");
    return match(`${x.task} ${x.description ?? ""} ${projectName}`);
  });
  const empty = p.length + c.length + m.length + e.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Search")}
        description={t("Look across projects, clients, team and entries.")}
      />

      <TextField
        fullWidth
        name="workspace-search"
        value={q}
        onChange={(value) => navigate({ to: "/search", search: { q: value } })}
      >
        <Label className="sr-only">{t("Search workspace")}</Label>
        <Input placeholder={t("Search…")} />
      </TextField>

      {empty ? (
        <EmptyBlock
          icon={<Magnifier className="size-5" />}
          title={term ? t("No matches") : t("Start typing")}
          description={
            term
              ? t("Try another keyword or check the spelling.")
              : t("Results appear as you type.")
          }
        />
      ) : (
        <div className="space-y-6">
          {p.length > 0 && (
            <Section title={t("Projects")}>
              {p.map((item) => (
                <RouterLink
                  key={item.id}
                  to="/projects/$projectId"
                  params={{ projectId: item.id }}
                  className="block px-4 py-3"
                >
                  <ProjectLabel project={item} label={item.name} />
                </RouterLink>
              ))}
            </Section>
          )}
          {c.length > 0 && (
            <Section title={t("Clients")}>
              {c.map((item) => (
                <RouterLink key={item.id} to="/clients" className="block px-4 py-3">
                  {item.name}
                </RouterLink>
              ))}
            </Section>
          )}
          {m.length > 0 && (
            <Section title={t("Team")}>
              {m.map((item) => (
                <RouterLink key={item.id} to="/team" className="block px-4 py-3">
                  {item.name}
                </RouterLink>
              ))}
            </Section>
          )}
          {e.length > 0 && (
            <Section title={t("Time entries")}>
              {e.slice(0, 10).map((item) => (
                <RouterLink key={item.id} to="/tracker" className="block px-4 py-3">
                  {item.task}
                </RouterLink>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography type="h3" weight="semibold" className="mb-2">
        {title}
      </Typography>
      <Card className="overflow-hidden">{children}</Card>
    </div>
  );
}
