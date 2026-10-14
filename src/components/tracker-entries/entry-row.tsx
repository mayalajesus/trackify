import { ActionDropdown } from "@/components/action-dropdown";
import { BillableIndicator } from "@/components/billable-indicator";
import { EntryTrelloModal } from "@/components/entry-trello-modal";
import { HeroUIDatePicker } from "@/components/hero-ui-date-picker";
import { IconTooltip } from "@/components/icon-tooltip";
import { OverlapConfirmation } from "@/components/overlap-confirmation";
import { ProjectSelect } from "@/components/project-select";
import { TableEditingMode } from "@/components/table-editing-mode";
import type { TimeEntry } from "@/lib/domain";
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
import { useStore } from "@/lib/store";
import { useFavoriteTasks } from "@/lib/use-favorite-tasks";
import {
  Copy,
  LayoutColumns,
  PersonPlus,
  Play,
  Plus,
  Star,
  Thunderbolt,
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
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TrackerTaskTeam } from "../tracker-task-team";
import {
  trackerActionButtonClass,
  trackerActionCellClass,
  trackerActionLayoutClass,
  trackerCellClass,
  trackerDurationCellClass,
} from "./cell-styles";
import { EndTimeValue, InlineValidationTooltip, TrackerTimeEditor } from "./time-editor";
import type { EntryDraft, TrackerEditableField } from "./types";

export function toDraft(entry: TimeEntry): EntryDraft {
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

  useEffect(() => {
    if (!activeField) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (pendingEdit) return;
      const target = event.target instanceof Element ? event.target : null;
      const clickedEditor = target?.closest("[data-tracker-editor]");
      if (clickedEditor && rowRef.current?.contains(clickedEditor)) return;

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

      restoreField();
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

  const handleEditorBlur = () => {
    if (skipNextBlurRef.current || pendingEdit) return;
    restoreField();
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
              trackerStyle
              showClientNameInOptions
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
                <span className="tracker-project-name flex w-full min-w-0 items-center gap-2 truncate">
                  {projectName}
                </span>
                <span className="tracker-client-name block w-full min-w-0 truncate text-sm font-normal">
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
