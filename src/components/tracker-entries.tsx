import { TaskParticipantsProvider, TrackerTaskTeam } from "./tracker-task-team";
import { EntryTrelloModal } from "@/components/entry-trello-modal";
import { Star, Thunderbolt, LayoutColumns, PersonPlus } from "@gravity-ui/icons";
import { useFavoriteTasks } from "@/lib/use-favorite-tasks";
import { IconTooltip } from "@/components/icon-tooltip";
import { TableEditingMode } from "@/components/table-editing-mode";
import { Button } from "@heroui/react/button";
import { FieldError } from "@heroui/react/field-error";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Surface } from "@heroui/react/surface";
import { Table } from "@heroui/react/table";
import { TextField } from "@heroui/react/textfield";
import { TimeField } from "@heroui/react/time-field";
import { Tooltip } from "@heroui/react/tooltip";
import { Typography } from "@heroui/react/typography";
import { toast } from "@heroui/react/toast";
import { Time } from "@internationalized/date";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, ChevronUp, CircleExclamation, Copy, Play, TrashBin } from "@gravity-ui/icons";
import { ActionDropdown } from "@/components/action-dropdown";
import { BillableIndicator } from "@/components/billable-indicator";
import { DataTable } from "@/components/data-table";
import { HeroUIDatePicker } from "@/components/hero-ui-date-picker";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { OverlapConfirmation } from "@/components/overlap-confirmation";
import { ProjectSelect } from "@/components/project-select";
import { useStore } from "@/lib/store";
import {
  addSecondsToDateTime,
  dateTimeToTimestamp,
  formatDate,
  formatDuration,
  formatDurationInput,
  getDayOffset,
  getElapsedMinutes,
  getEndDateForClockRange,
  getEndDateForEntry,
  getEntryEndDayOffset,
  isValidDateOnly,
  parseDurationInput,
  shiftDate,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TimeEntry } from "@/lib/domain";

export interface TrackerDay {
  date: string;
  totalSeconds: number;
  entries: TimeEntry[];
}

type TrackerEditableField =
  "task" | "description" | "project" | "start" | "end" | "date" | "duration" | "billable";

type ActiveCell = {
  rowKey: string;
  field: TrackerEditableField;
} | null;

type TrackerGroup = {
  id: string;
  date: string;
  task: string;
  projectId: string | null;
  billable: boolean;
  entries: TimeEntry[];
  totalSeconds: number;
  start: string;
  end: string;
  endDate: string;
};

type EntryDraft = {
  date: string;
  task: string;
  projectId: string | null;
  start: string;
  end: string;
  endDate: string;
  duration: string;
  description: string;
  billable: boolean;
};

const trackerCellClass = "overflow-hidden";
const trackerDurationCellClass = "overflow-hidden text-center";
const trackerActionCellClass = "whitespace-nowrap px-2";
const trackerActionLayoutClass = "grid grid-cols-[2rem_2rem] items-center justify-end gap-1";
const trackerActionButtonClass = "size-8 min-w-8 shrink-0 p-0";

function toDraft(entry: TimeEntry): EntryDraft {
  return {
    date: entry.date,
    task: entry.task,
    projectId: entry.projectId,
    start: entry.start,
    end: entry.end,
    endDate: getEndDateForEntry(entry),
    duration: formatDurationInput(entry.seconds),
    description: entry.description ?? "",
    billable: entry.billable,
  };
}

function EndTimeValue({
  startDate,
  end,
  endDate,
}: {
  startDate: string;
  end: string;
  endDate: string;
}) {
  const dayOffset = getDayOffset(startDate, endDate);

  return (
    <span className="inline-flex items-baseline gap-1">
      <span>{end}</span>
      {dayOffset > 0 ? <sup>+{dayOffset}</sup> : null}
    </span>
  );
}

function toTimeValue(value: string): Time | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

  try {
    return new Time(hour, minute);
  } catch {
    return null;
  }
}

function formatTimeValue(value: Time): string {
  return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
}

function InlineValidationTooltip({ message, label }: { message: string | null; label: string }) {
  if (!message) return null;

  return (
    <Tooltip delay={0} closeDelay={0} shouldSkipAnimation>
      <Tooltip.Trigger
        aria-label={label}
        className="inline-flex size-6 min-w-6 shrink-0 items-center justify-center"
        data-tracker-editor="true"
      >
        <CircleExclamation aria-hidden="true" className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-xs break-words" showArrow>
        {message}
      </Tooltip.Content>
    </Tooltip>
  );
}

function TrackerTimeEditor({
  name,
  value,
  label,
  validationLabel,
  isInvalid,
  inputRef,
  onChange,
  onBlur,
  onKeyDown,
  errorMessage,
}: {
  name: string;
  value: string;
  label: string;
  validationLabel: string;
  isInvalid: boolean;
  inputRef: RefObject<HTMLDivElement | null>;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  errorMessage: string | null;
}) {
  const timeValue = toTimeValue(value) ?? new Time(0, 0);

  return (
    <div className="flex min-w-0 items-start gap-1">
      <TimeField
        aria-label={label}
        autoFocus
        className="inline-flex min-w-0 flex-1"
        granularity="minute"
        hourCycle={24}
        isInvalid={isInvalid}
        name={name}
        ref={inputRef}
        value={timeValue}
        onBlur={(event) => {
          const nextFocusedElement = event.relatedTarget;
          if (
            nextFocusedElement instanceof Node &&
            event.currentTarget.contains(nextFocusedElement)
          ) {
            return;
          }
          onBlur(value);
        }}
        onChange={(nextValue) => {
          if (nextValue) onChange(formatTimeValue(nextValue));
        }}
        onKeyDown={onKeyDown}
      >
        <TimeField.Group
          fullWidth
          variant="secondary"
          className="h-8 min-h-8 px-1"
          data-tracker-editor="true"
        >
          <TimeField.Input className="min-w-0 gap-0 overflow-hidden px-1 whitespace-nowrap">
            {(segment) => (
              <TimeField.Segment
                segment={segment}
                className="px-0.5 text-center whitespace-nowrap"
              />
            )}
          </TimeField.Input>
        </TimeField.Group>
        <FieldError className="sr-only">{errorMessage}</FieldError>
      </TimeField>
      <InlineValidationTooltip message={errorMessage} label={validationLabel} />
    </div>
  );
}

function groupKeyFor(entry: TimeEntry): string {
  return [
    entry.date,
    entry.task.trim().toLocaleLowerCase(),
    entry.projectId ?? "none",
    entry.billable ? "billable" : "internal",
    entry.taskDetails?.urgent ? "urgent" : "normal",
    entry.taskDetails?.trelloCard?.id ?? "",
  ].join("::");
}

function compareEntryRecency(a: TimeEntry, b: TimeEntry): number {
  const startOrder = `${b.date}T${b.start}`.localeCompare(`${a.date}T${a.start}`);
  if (startOrder !== 0) return startOrder;

  const endA = `${getEndDateForEntry(a)}T${a.end}`;
  const endB = `${getEndDateForEntry(b)}T${b.end}`;
  const endOrder = endB.localeCompare(endA);
  if (endOrder !== 0) return endOrder;

  const taskOrder = a.task.trim().localeCompare(b.task.trim(), undefined, {
    sensitivity: "base",
  });
  if (taskOrder !== 0) return taskOrder;

  const projectOrder = (a.projectId ?? "none").localeCompare(b.projectId ?? "none");
  if (projectOrder !== 0) return projectOrder;

  return a.id.localeCompare(b.id);
}

function compareGroupRecency(a: TrackerGroup, b: TrackerGroup): number {
  const latestA = a.entries[0];
  const latestB = b.entries[0];
  if (!latestA || !latestB) return 0;
  return compareEntryRecency(latestA, latestB);
}

function groupEntries(days: TrackerDay[]): TrackerGroup[] {
  const groups = new Map<string, TrackerGroup>();

  days.forEach((day) => {
    [...day.entries].sort(compareEntryRecency).forEach((entry) => {
      const key = groupKeyFor(entry);
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(entry);
        existing.totalSeconds += entry.seconds;
        existing.start = entry.start < existing.start ? entry.start : existing.start;
        const entryEndDate = getEndDateForEntry(entry);
        const existingEndKey = `${existing.endDate}T${existing.end}`;
        const entryEndKey = `${entryEndDate}T${entry.end}`;
        if (entryEndKey > existingEndKey) {
          existing.end = entry.end;
          existing.endDate = entryEndDate;
        }
        return;
      }

      groups.set(key, {
        id: `tracker-group-${encodeURIComponent(key)}`,
        date: entry.date,
        task: entry.task,
        projectId: entry.projectId,
        billable: entry.billable,
        entries: [entry],
        totalSeconds: entry.seconds,
        start: entry.start,
        end: entry.end,
        endDate: getEndDateForEntry(entry),
      });
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort(compareEntryRecency),
    }))
    .sort(compareGroupRecency);
}

function trackerEntryRowKey(_group: TrackerGroup, entry: TimeEntry, _index: number): string {
  return `tracker-entry-${encodeURIComponent(entry.id)}`;
}

export function TrackerEntries({ days }: { days: TrackerDay[] }) {
  const { deleteEntry, restoreEntry } = useStore();
  const { t, error } = useI18n();
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<TimeEntry[] | null>(null);
  const groups = useMemo(() => groupEntries(days), [days]);
  const rowKeys = useMemo(
    () =>
      new Set(
        groups.flatMap((group) =>
          group.entries.map((entry, index) => trackerEntryRowKey(group, entry, index)),
        ),
      ),
    [groups],
  );
  const selectedRowKeys = useMemo(() => {
    const selected = new Set(expandedGroups);
    if (activeCell) selected.add(activeCell.rowKey);
    return selected;
  }, [activeCell, expandedGroups]);

  useEffect(() => {
    if (activeCell && !rowKeys.has(activeCell.rowKey)) {
      setActiveCell(null);
    }
  }, [activeCell, rowKeys]);

  useEffect(() => {
    const groupIds = new Set(groups.map((group) => group.id));
    setExpandedGroups((current) => {
      const next = new Set([...current].filter((id) => groupIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [groups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deletedEntries = pendingDelete;
    deletedEntries.forEach((entry) => deleteEntry(entry.id));
    setPendingDelete(null);
    setActiveCell(null);
    toast.info(t("Time entry moved to trash"), {
      actionProps: {
        children: t("Undo"),
        onPress: () => {
          for (const entry of deletedEntries) {
            const result = restoreEntry(entry);
            if (!result.success)
              toast.danger(t("We couldn't restore this time entry"), {
                description: error(result.error),
              });
          }
        },
      },
      timeout: 20_000,
    });
  };

  return (
    <TaskParticipantsProvider>
      <DataTable
        className="tracker-entries-table"
        label={t("Time entries for selected period")}
        scrollHint={t("Scroll horizontally to see all columns")}
        minWidth="min-w-[1040px]"
        contentClassName="table-fixed"
        selectedKeys={selectedRowKeys}
      >
        <Table.Header>
          <Table.Column isRowHeader className="w-[27%] whitespace-nowrap">
            {t("Task")}
          </Table.Column>
          <Table.Column className="w-[20%] whitespace-nowrap">{t("Project / client")}</Table.Column>
          <Table.Column className="w-[8%] whitespace-nowrap text-center">
            {t("Start column")}
          </Table.Column>
          <Table.Column className="w-[8%] whitespace-nowrap text-center">{t("End")}</Table.Column>
          <Table.Column className="w-[11%] whitespace-nowrap text-center">{t("Date")}</Table.Column>
          <Table.Column className="w-[10%] whitespace-nowrap text-center">
            {t("Duration")}
          </Table.Column>
          <Table.Column className="w-[9%] text-center">{t("Team")}</Table.Column>
          <Table.Column className="w-[7%]" aria-label={t("Actions")} />
        </Table.Header>
        <Table.Body>
          {groups.flatMap((group) => {
            const isGrouped = group.entries.length > 1;
            const isExpanded = expandedGroups.has(group.id);

            if (!isGrouped) {
              const entry = group.entries[0];
              const rowKey = entry ? trackerEntryRowKey(group, entry, 0) : null;
              return entry
                ? [
                    <TrackerEntryRow
                      key={rowKey ?? entry.id}
                      entry={entry}
                      rowId={rowKey ?? entry.id}
                      activeField={activeCell?.rowKey === rowKey ? activeCell.field : null}
                      onActivate={(field) => setActiveCell({ rowKey: rowKey ?? entry.id, field })}
                      onDeactivate={() => setActiveCell(null)}
                      onRequestDelete={(entry) => setPendingDelete([entry])}
                    />,
                  ]
                : [];
            }

            return [
              <TrackerGroupSummaryRow
                key={group.id}
                group={group}
                isExpanded={isExpanded}
                onToggle={() => toggleGroup(group.id)}
                onRequestDelete={() => setPendingDelete(group.entries)}
              />,
              ...(isExpanded
                ? group.entries.flatMap((entry, index) => {
                    const rowKey = trackerEntryRowKey(group, entry, index);
                    return [
                      <TrackerEntryRow
                        key={rowKey}
                        entry={entry}
                        rowId={rowKey}
                        isGroupedChild
                        activeField={activeCell?.rowKey === rowKey ? activeCell.field : null}
                        onActivate={(field) => setActiveCell({ rowKey, field })}
                        onDeactivate={() => setActiveCell(null)}
                        onRequestDelete={(entry) => setPendingDelete([entry])}
                      />,
                    ];
                  })
                : []),
            ];
          })}
        </Table.Body>
      </DataTable>
      <Modal
        isOpen={Boolean(pendingDelete)}
        onOpenChange={(isOpen) => !isOpen && setPendingDelete(null)}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Delete time entry?")}</ModalLayout.Header>
              <ModalLayout.Body>
                <Typography type="body-sm" color="muted">
                  {pendingDelete
                    ? t(
                        pendingDelete.length > 1
                          ? "Delete {count} entries for “{task}”?"
                          : "Delete “{task}”? This action cannot be undone.",
                        {
                          count: pendingDelete.length,
                          task: pendingDelete[0]?.task ?? "",
                        },
                      )
                    : null}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary">
                  {t("Keep entry")}
                </Button>
                <Button variant="danger" onPress={confirmDelete}>
                  {t("Delete entry")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </TaskParticipantsProvider>
  );
}

function TrackerGroupSummaryRow({
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

function TrackerEntryRow({
  entry,
  rowId,
  isGroupedChild = false,
  activeField,
  onActivate,
  onDeactivate,
  onRequestDelete,
}: {
  entry: TimeEntry;
  rowId?: string | undefined;
  isGroupedChild?: boolean;
  activeField: TrackerEditableField | null;
  onActivate: (field: TrackerEditableField) => void;
  onDeactivate: () => void;
  onRequestDelete: (entry: TimeEntry) => void;
}) {
  const {
    projects,
    clients,
    timer,
    preferences,
    startTimerFromTask,
    addEntry,
    updateEntry,
    findEntryConflict,
  } = useStore();
  const { locale, t, error } = useI18n();
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);
  const timeFieldRef = useRef<HTMLDivElement | null>(null);
  const skipNextBlurRef = useRef(false);
  const savedDraftRef = useRef<EntryDraft>(toDraft(entry));
  const [draft, setDraft] = useState<EntryDraft>(() => toDraft(entry));
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [entryTaskMode, setEntryTaskMode] = useState<"trello" | "members" | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{
    candidate: EntryDraft;
    patch: Partial<Omit<TimeEntry, "id">>;
    conflict: TimeEntry;
  } | null>(null);

  useEffect(() => {
    if (activeField) return;
    const next = toDraft(entry);
    savedDraftRef.current = next;
    setDraft(next);
    setValidationMessage(null);
  }, [activeField, entry]);

  useEffect(() => {
    if (!activeField) return;
    if (activeField === "start" || activeField === "end") {
      const firstSegment = timeFieldRef.current?.querySelector<HTMLElement>(
        '[data-type]:not([data-type="literal"])',
      );
      firstSegment?.focus();
      return;
    }
    if (!focusRef.current) return;
    focusRef.current.focus();
    if (activeField === "task" || activeField === "description" || activeField === "duration") {
      focusRef.current.select();
    }
  }, [activeField]);

  const project = projects.find((item) => item.id === entry.projectId);
  const projectName = project?.name ?? t("No project");
  const clientName = project
    ? (clients.find((client) => client.id === project.clientId)?.name ?? t("Unknown client"))
    : t("No client");
  const selectedProject = projects.find((item) => item.id === draft.projectId);
  const selectedClientName = selectedProject
    ? (clients.find((client) => client.id === selectedProject.clientId)?.name ??
      t("Unknown client"))
    : t("No client");
  const entryEndDate = getEndDateForEntry(entry);
  const entryEndDayOffset = getEntryEndDayOffset(entry);
  const endTimeLabel = `End time: ${entry.end}${
    entryEndDayOffset > 0
      ? `, ${entryEndDayOffset === 1 ? "next day" : `${entryEndDayOffset} days later`}`
      : ""
  }`;
  const validateDraft = (candidate: EntryDraft, allowFullDayDuration = false): string | null => {
    if (!candidate.task.trim()) return t("Task is required.");
    if (!isValidDateOnly(candidate.date)) return t("Choose a valid date.");
    const elapsedMinutes = getElapsedMinutes(
      candidate.date,
      candidate.start,
      candidate.endDate,
      candidate.end,
    );
    const preciseDuration = parseDurationInput(candidate.duration);
    if (elapsedMinutes <= 0 && !allowFullDayDuration && !(preciseDuration && preciseDuration > 0)) {
      return t("End time must be after start time.");
    }
    if (candidate.projectId !== null && !projects.some((item) => item.id === candidate.projectId)) {
      return t("Choose an existing project or No project.");
    }
    return null;
  };

  const notifySaved = (candidate: EntryDraft, warning?: string) => {
    savedDraftRef.current = candidate;
    setDraft(candidate);
    setValidationMessage(null);
    const durationSeconds = parseDurationInput(candidate.duration);
    toast.success(t("Entry updated"), {
      description: `${candidate.task} · ${durationSeconds === null ? candidate.duration : formatDuration(durationSeconds, locale)}`,
    });
    if (warning) toast.info(t("Overlapping time"), { description: error(warning) });
  };

  const queueIfOverlapping = (
    candidate: EntryDraft,
    patch: Partial<Omit<TimeEntry, "id">>,
  ): boolean => {
    const conflict = findEntryConflict({ ...entry, ...patch }, entry.id);
    if (!conflict) return false;
    setPendingEdit({ candidate, patch, conflict });
    return true;
  };

  const commitField = (
    field: "task" | "description" | "project" | "date" | "billable",
    value: string | boolean | null,
  ): boolean => {
    const draftField = field === "project" ? "projectId" : field;
    const normalizedValue =
      field === "task" || field === "description" ? String(value).trim() : value;
    const nextEndDate =
      field === "date" && typeof normalizedValue === "string" && isValidDateOnly(normalizedValue)
        ? shiftDate(normalizedValue, getDayOffset(draft.date, draft.endDate))
        : draft.endDate;
    const candidate = {
      ...draft,
      [draftField]: normalizedValue,
      ...(field === "date" ? { endDate: nextEndDate } : {}),
    } as EntryDraft;
    const message = validateDraft(candidate);
    if (message) {
      setValidationMessage(message);
      return false;
    }

    if (savedDraftRef.current[draftField] === candidate[draftField]) return true;

    const changedDateStart =
      field === "date" && typeof normalizedValue === "string"
        ? dateTimeToTimestamp(normalizedValue, candidate.start, 0, preferences.timezone)
        : null;
    const patch =
      field === "project"
        ? { projectId: candidate.projectId }
        : field === "date"
          ? {
              date: candidate.date,
              endDate: candidate.endDate !== candidate.date ? candidate.endDate : undefined,
              startTimestamp: changedDateStart ?? undefined,
              endTimestamp:
                changedDateStart === null ? undefined : changedDateStart + entry.seconds * 1000,
            }
          : { [field]: normalizedValue };
    if (field === "date" && queueIfOverlapping(candidate, patch)) return false;
    const result = updateEntry(entry.id, patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      return false;
    }

    notifySaved(candidate, result.warning);
    return true;
  };

  const commitTime = (start: string, end: string, close = false): boolean => {
    const endDate = getEndDateForClockRange(draft.date, start, end, draft.endDate);
    const elapsedMinutes = getElapsedMinutes(draft.date, start, endDate, end);
    const elapsedSeconds = elapsedMinutes * 60;
    const candidate = {
      ...draft,
      start,
      end,
      endDate,
      duration: formatDurationInput(elapsedSeconds),
    };
    const message = validateDraft(candidate);
    if (message) {
      setValidationMessage(message);
      return false;
    }

    if (
      savedDraftRef.current.start === start &&
      savedDraftRef.current.end === end &&
      savedDraftRef.current.endDate === endDate
    ) {
      if (close) onDeactivate();
      return true;
    }

    const patch = {
      start,
      end,
      endDate: endDate !== draft.date ? endDate : undefined,
      seconds: elapsedSeconds,
      startTimestamp: dateTimeToTimestamp(draft.date, start, 0, preferences.timezone) ?? undefined,
      endTimestamp: dateTimeToTimestamp(endDate, end, 0, preferences.timezone) ?? undefined,
    };
    if (queueIfOverlapping(candidate, patch)) return false;
    const result = updateEntry(entry.id, patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      return false;
    }

    notifySaved(candidate, result.warning);
    if (close) onDeactivate();
    return true;
  };

  const commitDuration = (value: string, close = false): boolean => {
    const totalSeconds = parseDurationInput(value);
    if (totalSeconds === null) {
      setValidationMessage(
        t("Use H:MM, H:MM:SS, HHMM, HMM, 2h or Ns (for example, 1:20, 00:00:49, 120, 825 or 45s)."),
      );
      return false;
    }

    const finish = addSecondsToDateTime(draft.date, draft.start, totalSeconds);
    const startTimestamp = dateTimeToTimestamp(draft.date, draft.start, 0, preferences.timezone);
    const endTimestamp = startTimestamp === null ? null : startTimestamp + totalSeconds * 1000;
    const candidate = {
      ...draft,
      end: finish.end,
      endDate: finish.endDate,
      duration: formatDurationInput(totalSeconds),
    };
    const message = validateDraft(candidate, totalSeconds === 24 * 60 * 60);
    if (message) {
      setValidationMessage(message);
      return false;
    }

    if (
      savedDraftRef.current.end === finish.end &&
      savedDraftRef.current.endDate === finish.endDate &&
      savedDraftRef.current.duration === candidate.duration
    ) {
      if (close) onDeactivate();
      return true;
    }

    const patch = {
      end: finish.end,
      endDate: finish.endDate !== draft.date ? finish.endDate : undefined,
      seconds: totalSeconds,
      startTimestamp: startTimestamp ?? undefined,
      endTimestamp: endTimestamp ?? undefined,
    };
    if (queueIfOverlapping(candidate, patch)) return false;
    const result = updateEntry(entry.id, patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      return false;
    }

    notifySaved(candidate, result.warning);
    if (close) onDeactivate();
    return true;
  };

  const restoreField = () => {
    skipNextBlurRef.current = true;
    window.requestAnimationFrame(() => {
      skipNextBlurRef.current = false;
    });
    if (activeField === "start" || activeField === "end") {
      setDraft((current) => ({
        ...current,
        [activeField]: savedDraftRef.current[activeField],
      }));
    } else if (activeField === "duration") {
      setDraft((current) => ({
        ...current,
        end: savedDraftRef.current.end,
        endDate: savedDraftRef.current.endDate,
        duration: savedDraftRef.current.duration,
      }));
    } else {
      const draftField = activeField === "project" ? "projectId" : (activeField ?? "task");
      setDraft((current) => ({
        ...current,
        [draftField]: savedDraftRef.current[draftField],
      }));
    }
    setValidationMessage(null);
    onDeactivate();
  };

  const finishEditing = (valueOverride?: string): boolean => {
    if (!activeField) return true;
    if (activeField === "task" || activeField === "description") {
      const value = valueOverride ?? draft[activeField];
      const saved = commitField(activeField, value);
      if (saved) onDeactivate();
      return saved;
    }
    if (activeField === "start" || activeField === "end") {
      const start =
        activeField === "start" && valueOverride !== undefined ? valueOverride : draft.start;
      const end = activeField === "end" && valueOverride !== undefined ? valueOverride : draft.end;
      return commitTime(start, end, true);
    }
    if (activeField === "duration") {
      return commitDuration(valueOverride ?? draft.duration, true);
    }
    if (activeField === "project") {
      const saved = commitField("project", draft.projectId);
      if (saved) onDeactivate();
      return saved;
    }
    if (activeField === "date") {
      const saved = commitField("date", draft.date);
      if (saved) onDeactivate();
      return saved;
    }
    return true;
  };

  useEffect(() => {
    if (!activeField) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (pendingEdit) return;
      const target = event.target instanceof Element ? event.target : null;
      const clickedEditor = target?.closest("[data-tracker-editor]");
      if (clickedEditor) return;

      const clickedField = target
        ?.closest("[data-tracker-field]")
        ?.getAttribute("data-tracker-field");
      const clickedAction = target?.closest("[data-tracker-action]");
      const clickedDatePicker = target?.closest(
        "[data-tracker-date-picker], [data-tracker-date-picker-popover]",
      );
      const clickedProjectSelect = target?.closest(
        "[data-project-select], [data-project-select-popover]",
      );

      const clickedActiveOverlay =
        (activeField === "date" && clickedDatePicker) ||
        (activeField === "project" && clickedProjectSelect);
      if (clickedActiveOverlay) return;

      if (rowRef.current?.contains(target)) {
        if (clickedField && clickedField !== activeField) {
          if (!finishEditing()) {
            event.preventDefault();
            event.stopPropagation();
          }
        } else if (clickedAction && !finishEditing()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (!finishEditing()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  });

  const startAgain = () => {
    const result = startTimerFromTask(entry);
    if (!result.success)
      toast.danger(t("We couldn't start the timer"), { description: error(result.error) });
  };

  const duplicateEntry = () => {
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

  const confirmPendingEdit = () => {
    if (!pendingEdit) return;
    const result = updateEntry(entry.id, pendingEdit.patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      setPendingEdit(null);
      return;
    }
    notifySaved(pendingEdit.candidate);
    setPendingEdit(null);
    onDeactivate();
  };

  const { isFavorite, toggleFavorite } = useFavoriteTasks();

  const actionCell = (
    <Table.Cell className={trackerActionCellClass}>
      <div className={trackerActionLayoutClass} data-tracker-action>
        <IconTooltip>
          <Button
            isIconOnly
            aria-label={t("Start {task} again", { task: entry.task })}
            isDisabled={timer.status !== "idle"}
            className={trackerActionButtonClass}
            variant={isHovered || Boolean(activeField) ? "tertiary" : "ghost"}
            onPress={startAgain}
          >
            <Play className="size-4" />
          </Button>
        </IconTooltip>
        <ActionDropdown
          ariaLabel={t("Actions for {task}", { task: entry.task })}
          items={[
            {
              id: "urgent",
              label: t(entry.taskDetails?.urgent ? "Unmark urgent" : "Mark urgent"),
              icon: <Thunderbolt className="size-4" />,
            },
            {
              id: "favorite",
              label: t(isFavorite(entry) ? "Remove from favorites" : "Add to favorites"),
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
              const result = updateEntry(entry.id, {
                taskDetails: {
                  id: entry.taskDetails?.id ?? crypto.randomUUID(),
                  ...entry.taskDetails,
                  urgent: !entry.taskDetails?.urgent,
                },
              });
              if (!result.success) {
                toast.danger(t("Unable to save urgency"), { description: error(result.error) });
              }
            }
            if (key === "favorite") toggleFavorite(entry);
            if (key === "duplicate") duplicateEntry();
            if (key === "delete") onRequestDelete(entry);
          }}
        />
        {entryTaskMode ? (
          <EntryTrelloModal
            entries={[entry]}
            mode={entryTaskMode}
            onClose={() => setEntryTaskMode(null)}
          />
        ) : null}
        <OverlapConfirmation
          conflict={pendingEdit?.conflict ?? null}
          isOpen={pendingEdit !== null}
          onCancel={() => setPendingEdit(null)}
          onConfirm={confirmPendingEdit}
        />
      </div>
    </Table.Cell>
  );

  const errorFor = (field: TrackerEditableField) =>
    activeField === field && validationMessage ? (
      <InlineValidationTooltip label={t("Show validation error")} message={validationMessage} />
    ) : null;

  const handleTextKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    field: "task" | "description",
  ) => {
    // Keep typing out of the table's type-ahead search, which captures spaces.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      restoreField();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (commitField(field, draft[field])) onDeactivate();
    }
  };

  const handleTimeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      restoreField();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitTime(draft.start, draft.end, true);
    }
  };

  const handleDurationKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      restoreField();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitDuration(draft.duration, true);
    }
  };

  const refocusEditor = () => {
    window.requestAnimationFrame(() => {
      if (activeField === "start" || activeField === "end") {
        const firstSegment = timeFieldRef.current?.querySelector<HTMLElement>(
          '[data-type]:not([data-type="literal"])',
        );
        firstSegment?.focus();
        return;
      }
      if (activeField && focusRef.current) focusRef.current.focus();
    });
  };

  const handleEditorBlur = (value: string) => {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      return;
    }
    if (!finishEditing(value)) refocusEditor();
  };

  const cellButtonClass =
    "inline-flex min-w-0 max-w-full truncate whitespace-nowrap px-1 py-1 text-left";
  const descriptionButtonClass =
    "inline-flex min-w-0 max-w-full truncate whitespace-nowrap px-0 py-0 text-left text-sm font-normal text-muted";
  const taskButtonClass =
    "inline-flex h-5 min-h-5 min-w-0 max-w-full flex-[0_1_auto] items-center justify-start px-0 py-0 text-left whitespace-nowrap font-semibold";
  const projectButtonClass =
    "inline-flex h-auto min-h-8 w-full min-w-0 items-start justify-center px-1 py-1 text-left font-medium";
  const timeSlotClass =
    "inline-flex h-8 w-full min-w-0 items-center justify-center px-1 whitespace-nowrap";
  const compactInputClass = "h-8 min-h-8 px-2 py-1";
  const durationInputClass = `${compactInputClass} w-full min-w-0 max-w-full`;
  return (
    <Table.Row
      {...(rowId ? { id: rowId } : {})}
      ref={rowRef}
      data-tracker-entry="true"
      data-grouped-child={isGroupedChild || undefined}
      onHoverChange={setIsHovered}
    >
      <Table.Cell className={`${trackerCellClass} min-w-0 ${isGroupedChild ? "pl-8" : ""}`.trim()}>
        {activeField ? <TableEditingMode /> : null}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {activeField === "task" ? (
              <div className="flex min-w-0 flex-1 items-start gap-1">
                <TextField
                  className="min-w-0 flex-1"
                  fullWidth
                  name={`task-${entry.id}`}
                  value={draft.task}
                  isInvalid={Boolean(validationMessage)}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      task: value,
                    }))
                  }
                >
                  <Label className="sr-only">{t("Task")}</Label>
                  <Input
                    ref={focusRef}
                    className={compactInputClass}
                    data-tracker-editor="true"
                    onBlur={(event) => handleEditorBlur(event.currentTarget.value)}
                    onKeyDown={(event) => handleTextKeyDown(event, "task")}
                  />
                  <FieldError className="sr-only">{validationMessage}</FieldError>
                </TextField>
                <InlineValidationTooltip
                  label={t("Show validation error")}
                  message={validationMessage}
                />
              </div>
            ) : (
              <div className="min-w-0 flex-[0_1_auto]">
                <Tooltip delay={350}>
                  <Button
                    size="sm"
                    variant="ghost"
                    fullWidth
                    className={taskButtonClass}
                    data-tracker-field="task"
                    onPress={() => onActivate("task")}
                  >
                    <span className="truncate">{entry.task}</span>
                    {isFavorite(entry) ? (
                      <Star
                        className="size-3.5 shrink-0 text-warning"
                        aria-label={t("Favorite tasks")}
                      />
                    ) : null}
                    {entry.taskDetails?.trelloCard ? (
                      <LayoutColumns
                        className="size-3.5 shrink-0 text-accent"
                        aria-label={entry.taskDetails.trelloCard.name}
                      />
                    ) : null}
                    {entry.taskDetails?.urgent ? (
                      <Thunderbolt
                        className="size-3.5 shrink-0 text-danger"
                        aria-label={t("Urgent")}
                      />
                    ) : null}
                  </Button>
                  <Tooltip.Content
                    showArrow
                    className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
                  >
                    {entry.task}
                  </Tooltip.Content>
                </Tooltip>
              </div>
            )}
            {entry.billable ? <BillableIndicator billable mode="icon" /> : null}
          </div>
          {activeField === "description" ? (
            <div className="flex min-w-0 items-start gap-1">
              <TextField
                className="min-w-0 flex-1"
                fullWidth
                name={`description-${entry.id}`}
                value={draft.description}
                isInvalid={Boolean(validationMessage)}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    description: value,
                  }))
                }
              >
                <Label className="sr-only">{t("Description")}</Label>
                <Input
                  ref={focusRef}
                  className={compactInputClass}
                  data-tracker-editor="true"
                  placeholder={t("Add a note")}
                  onBlur={(event) => handleEditorBlur(event.currentTarget.value)}
                  onKeyDown={(event) => handleTextKeyDown(event, "description")}
                />
                <FieldError className="sr-only">{validationMessage}</FieldError>
              </TextField>
              <InlineValidationTooltip
                label={t("Show validation error")}
                message={validationMessage}
              />
            </div>
          ) : (
            <Tooltip delay={350}>
              <Button
                size="sm"
                variant="ghost"
                fullWidth
                aria-label={t(entry.description ? "Edit description" : "Add description")}
                className={`${descriptionButtonClass} h-5 min-h-5 justify-start`}
                data-tracker-field="description"
                onPress={() => onActivate("description")}
              >
                {entry.description || ""}
              </Button>
              <Tooltip.Content
                showArrow
                className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
              >
                {entry.description || t("Add description")}
              </Tooltip.Content>
            </Tooltip>
          )}
        </div>
      </Table.Cell>

      <Table.Cell className={trackerCellClass}>
        {activeField === "project" ? (
          <div data-tracker-field="project">
            <ProjectSelect
              ariaLabel={t("Project")}
              value={draft.projectId ?? "none"}
              allowArchivedId={entry.projectId}
              onChange={(value) => {
                const next = value === "none" || value === "all" ? null : value;
                setDraft((current) => ({ ...current, projectId: next }));
                if (commitField("project", next)) onDeactivate();
              }}
            />
            <Tooltip delay={350}>
              <Tooltip.Trigger className="mt-1 block truncate">
                {selectedClientName}
              </Tooltip.Trigger>
              <Tooltip.Content
                showArrow
                className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
              >
                {selectedClientName}
              </Tooltip.Content>
            </Tooltip>
            {errorFor("project")}
          </div>
        ) : (
          <Tooltip delay={350}>
            <Button
              size="sm"
              variant="ghost"
              fullWidth
              className={projectButtonClass}
              data-tracker-field="project"
              onPress={() => onActivate("project")}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex w-full min-w-0 items-center gap-2 truncate font-medium">
                  {projectName}
                </span>
                <span className="block w-full min-w-0 truncate text-sm font-normal text-muted">
                  {clientName}
                </span>
              </span>
            </Button>
            <Tooltip.Content
              showArrow
              className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
            >{`${projectName}\n${clientName}`}</Tooltip.Content>
          </Tooltip>
        )}
      </Table.Cell>

      <Table.Cell className={`${trackerCellClass} text-center`}>
        {activeField === "start" ? (
          <TrackerTimeEditor
            name={`start-${entry.id}`}
            value={draft.start}
            label={t("Start time")}
            isInvalid={Boolean(validationMessage)}
            inputRef={timeFieldRef}
            onChange={(value) => setDraft((current) => ({ ...current, start: value }))}
            onBlur={handleEditorBlur}
            onKeyDown={handleTimeKeyDown}
            errorMessage={validationMessage}
            validationLabel={t("Show validation error")}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={timeSlotClass}
            data-tracker-field="start"
            aria-label={t("Start time: {time}", { time: entry.start })}
            onPress={() => onActivate("start")}
          >
            {entry.start}
          </Button>
        )}
      </Table.Cell>

      <Table.Cell className={`${trackerCellClass} text-center`}>
        {activeField === "end" ? (
          <TrackerTimeEditor
            name={`end-${entry.id}`}
            value={draft.end}
            label={`${t("End time")}${
              getDayOffset(draft.date, draft.endDate) > 0 ? `, ${t("next day")}` : ""
            }`}
            isInvalid={Boolean(validationMessage)}
            inputRef={timeFieldRef}
            onChange={(value) => setDraft((current) => ({ ...current, end: value }))}
            onBlur={handleEditorBlur}
            onKeyDown={handleTimeKeyDown}
            errorMessage={validationMessage}
            validationLabel={t("Show validation error")}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={timeSlotClass}
            data-tracker-field="end"
            aria-label={endTimeLabel}
            onPress={() => onActivate("end")}
          >
            <EndTimeValue startDate={entry.date} end={entry.end} endDate={entryEndDate} />
          </Button>
        )}
      </Table.Cell>

      <Table.Cell className={`${trackerCellClass} text-center`}>
        {activeField === "date" ? (
          <div data-tracker-field="date">
            <HeroUIDatePicker
              value={draft.date}
              label={t("Date")}
              className="inline-flex w-fit max-w-full"
              compact
              autoFocus
              isInvalid={Boolean(validationMessage)}
              onChange={(next) => {
                setDraft((current) => ({ ...current, date: next }));
                if (isValidDateOnly(next) && commitField("date", next)) onDeactivate();
              }}
              onEscape={restoreField}
            />
            {errorFor("date")}
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={cellButtonClass}
            data-tracker-field="date"
            onPress={() => onActivate("date")}
          >
            {formatDate(entry.date, locale)}
          </Button>
        )}
      </Table.Cell>

      <Table.Cell className={trackerDurationCellClass}>
        {activeField === "duration" ? (
          <div className="flex min-w-0 items-start gap-1">
            <TextField
              className="inline-flex min-w-0 flex-1"
              name={`duration-${entry.id}`}
              value={draft.duration}
              isInvalid={Boolean(validationMessage)}
              onChange={(value) => setDraft((current) => ({ ...current, duration: value }))}
            >
              <Label className="sr-only">{t("Duration")}</Label>
              <Input
                ref={focusRef}
                className={durationInputClass}
                data-tracker-editor="true"
                variant="secondary"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("e.g. 2:45, 00:00:49 or 40s")}
                onBlur={(event) => handleEditorBlur(event.currentTarget.value)}
                onKeyDown={handleDurationKeyDown}
              />
              <FieldError className="sr-only">{validationMessage}</FieldError>
            </TextField>
            <InlineValidationTooltip
              label={t("Show validation error")}
              message={validationMessage}
            />
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={cellButtonClass}
            data-tracker-field="duration"
            onPress={() => onActivate("duration")}
          >
            {formatDuration(entry.seconds, locale)}
          </Button>
        )}
      </Table.Cell>

      <Table.Cell className="text-center">
        <TrackerTaskTeam entries={[entry]} />
      </Table.Cell>
      {actionCell}
    </Table.Row>
  );
}
