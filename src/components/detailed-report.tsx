import { Button } from "@heroui/react/button";
import { Table } from "@heroui/react/table";
import { Tooltip } from "@heroui/react/tooltip";
import { ArrowRotateLeft, CircleInfo, Thunderbolt } from "@gravity-ui/icons";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { ProfileAvatar } from "@/components/profile-avatar";
import { ClientColorLabel } from "@/components/project-color";
import { ReportTableWidget } from "@/components/report-widget";
import type { Client, Member, Project, TimeEntry } from "@/lib/domain";
import { formatClock, getEntryEndDayOffset } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { clientColorValue } from "@/lib/client-colors";
import { useStore } from "@/lib/store";

type MemberTotal = { seconds: number; projects: Map<string, number> };

export function DetailedReport({
  entries,
  members,
  projects,
  clients,
  periodLabel,
  onClear,
}: {
  entries: TimeEntry[];
  members: Member[];
  projects: Project[];
  clients: Client[];
  periodLabel: string;
  onClear: () => void;
}) {
  const { locale, t } = useI18n();
  const { preferencesByUserId } = useStore();
  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const totals = useMemo(() => {
    const result = new Map<string, MemberTotal>();
    for (const entry of entries) {
      const total = result.get(entry.userId) ?? { seconds: 0, projects: new Map<string, number>() };
      const seconds = Math.max(0, entry.seconds);
      const projectId = entry.projectId ?? "none";
      total.seconds += seconds;
      total.projects.set(projectId, (total.projects.get(projectId) ?? 0) + seconds);
      result.set(entry.userId, total);
    }
    return result;
  }, [entries]);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const percentageFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const projectDetails = (id: string) => {
    const project = projectMap.get(id);
    const client = project ? clientMap.get(project.clientId) : undefined;
    return {
      name: project?.name ?? t(id === "none" ? "No project" : "Unknown project"),
      client: client?.name ?? t("No client"),
      color: project ? clientColorValue(client?.color) : "var(--muted)",
      clientColor: client ? clientColorValue(client.color) : undefined,
    };
  };

  return (
    <ReportTableWidget
      title={
        <span className="flex items-center gap-1 text-sm font-normal">
          {t("Detailed entries")}
          <Tooltip delay={0}>
            <Tooltip.Trigger
              aria-label={t("Detailed report table")}
              className="inline-flex text-muted"
            >
              <CircleInfo aria-hidden="true" className="size-3.5" />
            </Tooltip.Trigger>
            <Tooltip.Content>
              {t("Each row shows an entry and the member's total for the selected period.")}
            </Tooltip.Content>
          </Tooltip>
        </span>
      }
      contentDescription={t("Detailed report table")}
      isEmpty={entries.length === 0}
      emptyState={{
        title: t("No time entries match"),
        description: t("Try a wider period or clear one of the active filters."),
        action: (
          <Button variant="secondary" onPress={onClear}>
            <ArrowRotateLeft className="size-4" />
            {t("Clear filters")}
          </Button>
        ),
      }}
    >
      <DataTable
        label={t("Detailed report table")}
        className="detailed-report-table"
        minWidth="min-w-[880px]"
        contentClassName="table-fixed"
        scrollHint={t("Scroll horizontally to see all columns")}
      >
        <Table.Header>
          <Table.Column isRowHeader className="w-[16%]">
            {t("Team member")}
          </Table.Column>
          <Table.Column className="w-[32%]">{t("Task")}</Table.Column>
          <Table.Column className="w-[14%]">{t("Start – End")}</Table.Column>
          <Table.Column className="w-[38%]">
            {t("Total tracked ({period})", { period: periodLabel })}
          </Table.Column>
        </Table.Header>
        <Table.Body>
          {entries.map((entry) => {
            const member = memberMap.get(entry.userId);
            const memberName = member?.name ?? t("Unknown member");
            const project = projectDetails(entry.projectId ?? "none");
            const total = totals.get(entry.userId)!;
            const distribution = [...total.projects]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([id, seconds]) => ({
                id,
                seconds,
                percentage: total.seconds > 0 ? (seconds / total.seconds) * 100 : 0,
                ...projectDetails(id),
              }));
            const dayOffset = getEntryEndDayOffset(entry);
            return (
              <Table.Row key={entry.id}>
                <Table.Cell>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div className="detailed-report-avatar shrink-0">
                      <ProfileAvatar
                        member={{ id: entry.userId, name: memberName }}
                        avatarUrl={preferencesByUserId[entry.userId]?.avatarUrl ?? null}
                      />
                    </div>
                    <span className="truncate" title={memberName}>
                      {memberName}
                    </span>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <span
                          className="min-w-0 line-clamp-2 break-words"
                          title={entry.task || entry.description || undefined}
                        >
                          {entry.task || entry.description || "—"}
                        </span>
                        {entry.taskDetails?.urgent ? (
                          <Tooltip delay={0}>
                            <Tooltip.Trigger
                              aria-label={t("Urgent")}
                              className="inline-flex shrink-0 text-danger"
                            >
                              <Thunderbolt aria-hidden="true" className="size-3.5" />
                            </Tooltip.Trigger>
                            <Tooltip.Content>{t("Urgent")}</Tooltip.Content>
                          </Tooltip>
                        ) : null}
                      </div>
                      {entry.description?.trim() ? (
                        <Tooltip delay={350}>
                          <Tooltip.Trigger className="mt-1 block text-muted">
                            {t("1 note")}
                          </Tooltip.Trigger>
                          <Tooltip.Content
                            showArrow
                            className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
                          >
                            {entry.description}
                          </Tooltip.Content>
                        </Tooltip>
                      ) : null}
                      <div className="mt-1 flex min-w-0 items-center gap-1 text-muted">
                        <span className="truncate" title={`${project.name} | ${project.client}`}>
                          {project.name} |{" "}
                          {project.clientColor ? (
                            <ClientColorLabel color={project.clientColor}>
                              {project.client}
                            </ClientColorLabel>
                          ) : (
                            project.client
                          )}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-muted tabular-nums">
                      {formatClock(Math.max(0, entry.seconds))}
                    </span>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="whitespace-nowrap text-muted tabular-nums">
                    {entry.start} – {entry.end}
                    {dayOffset > 0 ? ` +${dayOffset}` : ""}
                  </div>
                  <div className="text-muted">
                    {dateFormatter.format(new Date(`${entry.date}T12:00:00`))}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-5">
                    <span className="w-20 shrink-0 text-muted tabular-nums">
                      {formatClock(total.seconds)}
                    </span>
                    <Tooltip delay={0}>
                      <Tooltip.Trigger
                        className="min-w-0 flex-1 rounded-sm py-3"
                        aria-label={t("Time distribution for {name}", { name: memberName })}
                      >
                        <span className="flex h-4 w-full overflow-hidden rounded-sm bg-default">
                          {distribution.map((segment) => (
                            <span
                              key={segment.id}
                              aria-hidden="true"
                              style={{
                                width: `${segment.percentage}%`,
                                backgroundColor: segment.color,
                              }}
                            />
                          ))}
                        </span>
                      </Tooltip.Trigger>
                      <Tooltip.Content
                        className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-surface p-4 text-foreground shadow-lg"
                        showArrow
                      >
                        <div className="mb-3 flex justify-between gap-3 text-xs font-medium">
                          <span>{memberName}</span>
                          <span className="tabular-nums">{formatClock(total.seconds)}</span>
                        </div>
                        <div className="space-y-2">
                          {distribution.map((segment) => (
                            <div
                              key={segment.id}
                              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-xs"
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span
                                  aria-hidden="true"
                                  className="size-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: segment.color }}
                                />
                                <span
                                  className="truncate"
                                  title={`${segment.name} – ${segment.client}`}
                                >
                                  {segment.name}{" "}
                                  <span className="text-muted">
                                    –{" "}
                                    {segment.clientColor ? (
                                      <ClientColorLabel color={segment.clientColor}>
                                        {segment.client}
                                      </ClientColorLabel>
                                    ) : (
                                      segment.client
                                    )}
                                  </span>
                                </span>
                              </span>
                              <span className="tabular-nums">{formatClock(segment.seconds)}</span>
                              <span className="w-12 text-right text-muted tabular-nums">
                                {percentageFormatter.format(segment.percentage)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </Tooltip.Content>
                    </Tooltip>
                  </div>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </DataTable>
    </ReportTableWidget>
  );
}
