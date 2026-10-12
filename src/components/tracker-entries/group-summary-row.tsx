import { ActionDropdown } from "@/components/action-dropdown";
import { EntryTrelloModal } from "@/components/entry-trello-modal";
import { IconTooltip } from "@/components/icon-tooltip";
import { formatDate, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useFavoriteTasks } from "@/lib/use-favorite-tasks";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  LayoutColumns,
  PersonPlus,
  Play,
  Star,
  Thunderbolt,
  TrashBin,
} from "@gravity-ui/icons";
import { Button } from "@heroui/react/button";
import { Surface } from "@heroui/react/surface";
import { Table } from "@heroui/react/table";
import { toast } from "@heroui/react/toast";
import { Tooltip } from "@heroui/react/tooltip";
import { useState } from "react";
import { TrackerTaskTeam } from "../tracker-task-team";
import { trackerActionButtonClass, trackerActionLayoutClass } from "./cell-styles";
import { trackerEntryRowKey } from "./grouping";
import { EndTimeValue } from "./time-editor";
import type { TrackerGroup } from "./types";

export function TrackerGroupSummaryRow({
  group,
  isExpanded,
  onToggle,
  onRequestDelete,
}: {
  group: TrackerGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onRequestDelete: () => void;
}) {
  const { projects, clients, timer, startTimerFromTask, addEntry, updateEntry } = useStore();
  const { isFavorite, toggleFavorite } = useFavoriteTasks();
  const { locale, t, error } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [entryTaskMode, setEntryTaskMode] = useState<"trello" | "members" | null>(null);
  const project = projects.find((item) => item.id === group.projectId);
  const projectName = project?.name ?? t("No project");
  const clientName = project
    ? (clients.find((client) => client.id === project.clientId)?.name ?? t("Unknown client"))
    : t("No client");
  const urgent = group.entries.some((entry) => entry.taskDetails?.urgent);
  const summaryCellClass = "overflow-hidden";
  const summaryTextClass = "block min-w-0 truncate whitespace-nowrap";
  const summarySurfaceVariant = "transparent";
  const toggleLabel = t(
    `${isExpanded ? "Collapse" : "Expand"} {count} entries for {task}; {type}`,
    {
      count: group.entries.length,
      task: group.task,
      type: group.billable ? t("billable") : t("internal"),
    },
  );

  const startAgain = () => {
    const result = startTimerFromTask({
      ...group,
      ...(group.entries[0]?.taskDetails ? { taskDetails: group.entries[0].taskDetails } : {}),
    });
    if (!result.success)
      toast.danger(t("We couldn't start the timer"), { description: error(result.error) });
  };

  const duplicateLatestEntry = () => {
    const entry = group.entries[0];
    if (!entry) return;
    const { id: _id, ...duplicate } = entry;
    const result = addEntry(duplicate, { allowWhileTimerActive: true, refreshBilling: true });
    if (!result.success) {
      toast.danger(t("We couldn't duplicate this time entry"), {
        description: error(result.error),
      });
      return;
    }
    toast.success(t("Entry duplicated"), {
      description: `${entry.task} · ${formatDuration(entry.seconds, locale)}`,
    });
    if (result.warning) {
      toast.info(t("Overlapping time"), { description: error(result.warning) });
    }
  };

  const handleSummaryClick = (event: React.MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-tracker-action], [data-tracker-group-toggle]")) return;
    onToggle();
  };

  return (
    <Table.Row
      id={group.id}
      data-tracker-group={group.id}
      onClick={handleSummaryClick}
      onHoverChange={setIsHovered}
    >
      <Table.Cell className={`${summaryCellClass} min-w-0 p-0`}>
        <Surface variant={summarySurfaceVariant} className="min-h-[76px] px-4 py-3">
          <div className="flex min-h-[3rem] min-w-0 flex-col justify-center">
            <Tooltip delay={350}>
              <Button
                size="sm"
                variant="ghost"
                aria-label={toggleLabel}
                aria-expanded={isExpanded}
                data-tracker-group-toggle
                className="inline-flex h-8 min-h-8 min-w-0 max-w-full justify-start px-1 py-1 text-left font-semibold"
                {...(group.entries[0]
                  ? { "aria-controls": trackerEntryRowKey(group, group.entries[0], 0) }
                  : {})}
                onPress={onToggle}
              >
                <span className="min-w-0 truncate">{group.task}</span>
                {isFavorite(group) ? (
                  <Star
                    className="size-3.5 shrink-0 text-warning"
                    aria-label={t("Favorite tasks")}
                  />
                ) : null}
                {group.entries[0]?.taskDetails?.trelloCard ? (
                  <LayoutColumns
                    className="size-3.5 shrink-0 text-accent"
                    aria-label={t("Link to Trello")}
                  />
                ) : null}
                {urgent ? (
                  <Thunderbolt className="size-3.5 shrink-0 text-danger" aria-label={t("Urgent")} />
                ) : null}
                {isExpanded ? (
                  <ChevronUp className="ml-1 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="ml-1 size-4 shrink-0" aria-hidden="true" />
                )}
              </Button>
              <Tooltip.Content
                showArrow
                className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
              >
                {group.task}
              </Tooltip.Content>
            </Tooltip>
            <span className="truncate pl-1 font-normal">
              {t(group.entries.length === 1 ? "{count} entry" : "{count} entries", {
                count: group.entries.length,
              })}
            </span>
          </div>
        </Surface>
      </Table.Cell>
      <Table.Cell className={`${summaryCellClass} p-0`}>
        <Surface
          variant={summarySurfaceVariant}
          className="flex min-h-[76px] items-center px-4 py-3"
        >
          <Tooltip delay={350}>
            <Tooltip.Trigger
              className="flex min-w-0 flex-col"
              aria-label={`${projectName}, ${clientName}`}
            >
              <span className={`${summaryTextClass} flex items-center gap-2 font-medium`}>
                {projectName}
              </span>
              <span className={`${summaryTextClass} text-sm font-normal text-muted`}>
                {clientName}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content
              showArrow
              className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
            >{`${projectName}\n${clientName}`}</Tooltip.Content>
          </Tooltip>
        </Surface>
      </Table.Cell>
      <Table.Cell className={`${summaryCellClass} p-0 text-center`}>
        <Surface
          variant={summarySurfaceVariant}
          className="flex min-h-[76px] items-center justify-center px-4 py-3"
        >
          <span className={`${summaryTextClass} text-center`}>{group.start}</span>
        </Surface>
      </Table.Cell>
      <Table.Cell className={`${summaryCellClass} p-0 text-center`}>
        <Surface
          variant={summarySurfaceVariant}
          className="flex min-h-[76px] items-center justify-center px-4 py-3"
        >
          <span className={`${summaryTextClass} text-center`}>
            <EndTimeValue startDate={group.date} end={group.end} endDate={group.endDate} />
          </span>
        </Surface>
      </Table.Cell>
      <Table.Cell className={`${summaryCellClass} p-0 text-center`}>
        <Surface
          variant={summarySurfaceVariant}
          className="flex min-h-[76px] items-center justify-center px-4 py-3"
        >
          <span className={`${summaryTextClass} text-center`}>
            {formatDate(group.date, locale)}
          </span>
        </Surface>
      </Table.Cell>
      <Table.Cell className={`${summaryCellClass} p-0 text-center`}>
        <Surface
          variant={summarySurfaceVariant}
          className="flex min-h-[76px] items-center justify-center px-4 py-3"
        >
          <span className={summaryTextClass}>{formatDuration(group.totalSeconds, locale)}</span>
        </Surface>
      </Table.Cell>
      <Table.Cell className="text-center">
        <TrackerTaskTeam entries={group.entries} />
      </Table.Cell>
      <Table.Cell className="overflow-hidden whitespace-nowrap p-0">
        <Surface
          variant={summarySurfaceVariant}
          className="flex min-h-[76px] items-center justify-end px-2 py-3"
        >
          <div className={trackerActionLayoutClass} data-tracker-action>
            <IconTooltip>
              <Button
                isIconOnly
                aria-label={t("Start {task} again", { task: group.task })}
                isDisabled={timer.status !== "idle"}
                className={trackerActionButtonClass}
                variant={isHovered || isExpanded ? "tertiary" : "ghost"}
                onPress={startAgain}
              >
                <Play className="size-4" />
              </Button>
            </IconTooltip>
            <ActionDropdown
              menuClassName="tracker-action-menu"
              ariaLabel={t("Actions for {task} group", { task: group.task })}
              items={[
                {
                  id: "urgent",
                  label: t(urgent ? "Unmark urgent" : "Mark urgent"),
                  icon: <Thunderbolt className="size-4" />,
                },
                {
                  id: "favorite",
                  label: t(isFavorite(group) ? "Remove from favorites" : "Add to favorites"),
                  icon: <Star className="size-4" />,
                },
                {
                  id: "duplicate",
                  label: t("Duplicate entry"),
                  icon: <Copy className="size-4" />,
                },
                {
                  id: "members",
                  label: t("Add members"),
                  icon: <PersonPlus className="size-4" />,
                },
                {
                  id: "trello",
                  label: t("Link to Trello"),
                  icon: <LayoutColumns className="size-4 text-[#0052CC]" />,
                },
                {
                  id: "delete",
                  label: t("Delete entry"),
                  icon: <TrashBin className="size-4" />,
                  tone: "danger",
                },
              ]}
              onAction={(key) => {
                if (key === "trello" || key === "members") setEntryTaskMode(key);
                if (key === "urgent") {
                  for (const entry of group.entries) {
                    const result = updateEntry(entry.id, {
                      taskDetails: {
                        id: entry.taskDetails?.id ?? crypto.randomUUID(),
                        ...entry.taskDetails,
                        urgent: !urgent,
                      },
                    });
                    if (!result.success) {
                      toast.danger(t("Unable to save urgency"), {
                        description: error(result.error),
                      });
                      break;
                    }
                  }
                }
                if (key === "favorite") toggleFavorite(group);
                if (key === "duplicate") duplicateLatestEntry();
                if (key === "delete") onRequestDelete();
              }}
            />
            {entryTaskMode ? (
              <EntryTrelloModal
                entries={group.entries}
                mode={entryTaskMode}
                onClose={() => setEntryTaskMode(null)}
              />
            ) : null}
          </div>
        </Surface>
      </Table.Cell>
    </Table.Row>
  );
}
