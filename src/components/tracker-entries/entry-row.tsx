import { ActionDropdown } from "@/components/action-dropdown";
import { BillableIndicator } from "@/components/billable-indicator";
import { EntryTrelloModal } from "@/components/entry-trello-modal";
import { HeroUIDatePicker } from "@/components/hero-ui-date-picker";
import { IconTooltip } from "@/components/icon-tooltip";
import { OverlapConfirmation } from "@/components/overlap-confirmation";
import { ProjectSelect } from "@/components/project-select";
import { ClientColorLabel } from "@/components/project-color";
import { TableEditingMode } from "@/components/table-editing-mode";
import type { TimeEntry } from "@/lib/domain";
import {
  formatDate,
  formatDuration,
  getDayOffset,
  getEndDateForEntry,
  getEntryEndDayOffset,
  isValidDateOnly,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useFavoriteTasks } from "@/lib/use-favorite-tasks";
import {
  Copy,
  LayoutColumns,
  PersonPlus,
  Play,
  Plus,
  Star,
  StarFill,
  Thunderbolt,
  ThunderboltFill,
  TrashBin,
} from "@gravity-ui/icons";
import { Button } from "@heroui/react/button";
import { FieldError } from "@heroui/react/field-error";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Table } from "@heroui/react/table";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@/lib/toast";
import { Tooltip } from "@heroui/react/tooltip";
import { useState } from "react";
import { useEntryEditor } from "./use-entry-editor";
import { TrackerTaskTeam } from "../tracker-task-team";
import {
  trackerActionButtonClass,
  trackerActionCellClass,
  trackerActionLayoutClass,
  trackerCellClass,
  trackerDurationCellClass,
} from "./cell-styles";
import { EndTimeValue, InlineValidationTooltip, TrackerTimeEditor } from "./time-editor";
import type { TrackerEditableField } from "./types";

export { toDraft } from "./use-entry-editor";

export function TrackerEntryRow({
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
  const { projects, clients, timer, startTimerFromTask, addEntry, updateEntry } = useStore();
  const { locale, t, error } = useI18n();
  const {
    rowRef,
    focusRef,
    timeFieldRef,
    draft,
    setDraft,
    validationMessage,
    pendingEdit,
    setPendingEdit,
    commitField,
    restoreField,
    confirmPendingEdit,
    handleTextKeyDown,
    handleTimeKeyDown,
    handleDurationKeyDown,
    handleEditorBlur,
  } = useEntryEditor(entry, activeField, onDeactivate);
  const [isHovered, setIsHovered] = useState(false);
  const [entryTaskMode, setEntryTaskMode] = useState<"trello" | "members" | null>(null);

  const project = projects.find((item) => item.id === entry.projectId);
  const projectName = project?.name ?? t("No project");
  const client = clients.find((item) => item.id === project?.clientId);
  const clientName = project ? (client?.name ?? t("Unknown client")) : t("No client");
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
          menuClassName="tracker-action-menu"
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
  const durationInputClass = `${compactInputClass} tracker-duration-input w-full min-w-0 max-w-full`;
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
        <div className="tracker-task-copy min-w-0">
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
                    onBlur={handleEditorBlur}
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
                      <StarFill
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
                      <ThunderboltFill
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
                  onBlur={handleEditorBlur}
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
                {entry.description || (
                  <span className="flex min-w-0 items-center gap-1 text-muted">
                    <Plus aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{t("Click to add a note")}</span>
                  </span>
                )}
              </Button>
              <Tooltip.Content
                showArrow
                className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words"
              >
                {entry.description || t("Click to add a note")}
              </Tooltip.Content>
            </Tooltip>
          )}
        </div>
      </Table.Cell>

      <Table.Cell className={trackerCellClass}>
        {activeField === "project" ? (
          <div data-tracker-field="project">
            <ProjectSelect
              required
              trackerStyle
              groupByClient
              showClientNameInOptions
              ariaLabel={t("Project")}
              value={draft.projectId ?? "none"}
              allowArchivedId={entry.projectId}
              onChange={(value) => {
                if (value === "none" || value === "all") return;
                const next = value;
                setDraft((current) => ({ ...current, projectId: next }));
                if (commitField("project", next)) onDeactivate();
              }}
            />
            <Tooltip delay={350}>
              <Tooltip.Trigger className="mt-1 block truncate">
                <ClientColorLabel
                  color={clients.find((item) => item.id === selectedProject?.clientId)?.color}
                >
                  {selectedClientName}
                </ClientColorLabel>
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
                <span className="tracker-project-name flex w-full min-w-0 items-center gap-2 truncate">
                  {projectName}
                </span>
                <span className="tracker-client-name block w-full min-w-0 truncate text-sm font-normal">
                  {client ? (
                    <ClientColorLabel color={client.color}>{clientName}</ClientColorLabel>
                  ) : (
                    clientName
                  )}
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
          <div className="tracker-inline-editor flex min-w-0 items-start gap-1">
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
                onBlur={handleEditorBlur}
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
