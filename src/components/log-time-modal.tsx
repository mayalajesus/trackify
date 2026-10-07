import { IconTooltip } from "@/components/icon-tooltip";
import { Button } from "@heroui/react/button";
import { Description } from "@heroui/react/description";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { TextArea } from "@heroui/react/textarea";
import { TextField } from "@heroui/react/textfield";
import { ToggleButton } from "@heroui/react/toggle-button";
import { ToggleButtonGroup } from "@heroui/react/toggle-button-group";
import { toast } from "@heroui/react/toast";
import { useEffect, useState } from "react";
import { BillableIndicator } from "@/components/billable-indicator";
import { FormAlert } from "@/components/form-feedback";
import { HeroUIDatePicker } from "@/components/hero-ui-date-picker";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { OverlapConfirmation } from "@/components/overlap-confirmation";
import { ProjectSelect } from "@/components/project-select";
import { ProjectFormModal } from "@/components/project-form-modal";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import {
  addSecondsToDateTime,
  dateTimeToTimestamp,
  getDayOffset,
  formatDuration,
  formatDurationInput,
  getManualEntryDefaults,
  getElapsedMinutes,
  getEndDateForClockRange,
  getEndDateForEntry,
  isValidDateOnly,
  parseDurationInput,
  shiftDate,
} from "@/lib/format";
import type { TimeEntry } from "@/lib/domain";

export function LogTimeModal({
  isOpen,
  onOpenChange,
  entry = null,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: TimeEntry | null;
}) {
  const {
    projects,
    can,
    clients,
    preferences,
    addEntry,
    updateEntry,
    findEntryConflict,
    currentUserId,
    timer,
  } = useStore();
  const { locale, t, error } = useI18n();
  const [timeMode, setTimeMode] = useState<"range" | "duration">("range");
  const [task, setTask] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState(
    () => getManualEntryDefaults(new Date(), preferences.timezone).date,
  );
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [duration, setDuration] = useState("1:00");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingEntry, setPendingEntry] = useState<Omit<TimeEntry, "id"> | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectInitialName, setProjectInitialName] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setProjectFormOpen(false);
      return;
    }
    const defaults = getManualEntryDefaults(new Date(), preferences.timezone);
    setTask(entry?.task ?? "");
    setProjectId(entry?.projectId ?? null);
    setDate(entry?.date ?? defaults.date);
    setStart(entry?.start ?? defaults.start);
    setEnd(entry?.end ?? defaults.end);
    setDuration(formatDurationInput(entry?.seconds ?? 3600));
    setTimeMode(entry && entry.seconds % 60 !== 0 ? "duration" : "range");
    setDescription(entry?.description ?? "");
    setBillable(entry?.billable ?? false);
    setSaveError(null);
    setPendingEntry(null);
  }, [entry, isOpen, preferences.timezone]);

  const originalEndDate = entry ? getEndDateForEntry(entry) : undefined;
  const preserveOriginalRange = Boolean(entry && start === entry.start && end === entry.end);
  const endDate =
    entry && preserveOriginalRange && originalEndDate
      ? shiftDate(date, getDayOffset(entry.date, originalEndDate))
      : getEndDateForClockRange(date, start, end, originalEndDate);
  const parsedDurationSeconds = parseDurationInput(duration);
  const durationFinish =
    parsedDurationSeconds === null
      ? null
      : addSecondsToDateTime(date, start, parsedDurationSeconds);
  const effectiveEnd = timeMode === "duration" && durationFinish ? durationFinish.end : end;
  const effectiveEndDate =
    timeMode === "duration" && durationFinish ? durationFinish.endDate : endDate;
  const entrySeconds =
    timeMode === "duration"
      ? (parsedDurationSeconds ?? 0)
      : getElapsedMinutes(date, start, effectiveEndDate, effectiveEnd) * 60;
  const taskError = task.trim().length === 0 ? t("Task is required") : undefined;
  const dateError = !isValidDateOnly(date) ? t("Choose a valid date") : undefined;
  const timeError =
    timeMode === "duration"
      ? parsedDurationSeconds === null
        ? t("Use H:MM, H:MM:SS, HHMM, HMM, 2h or Ns (for example, 2:45, 00:00:49 or 45s)")
        : undefined
      : entrySeconds <= 0
        ? t("End time must be after start time")
        : undefined;
  const manualTimerError =
    !entry && timer.status !== "idle"
      ? t("Stop the active timer before adding time manually.")
      : undefined;
  const invalid = Boolean(taskError || dateError || timeError || manualTimerError);

  const save = (candidate: Omit<TimeEntry, "id">) => {
    const result = entry ? updateEntry(entry.id, candidate) : addEntry(candidate);
    if (!result.success) {
      setSaveError(result.error);
      return;
    }
    toast.success(t(entry ? "Time entry updated" : "Time entry added"), {
      description: `${candidate.task} · ${formatDuration(candidate.seconds, locale)}`,
    });
    setTask("");
    setDescription("");
    setPendingEntry(null);
    onOpenChange(false);
  };

  const submit = () => {
    if (invalid) return;
    const cleanDescription = description.trim();
    const startTimestamp = dateTimeToTimestamp(date, start, 0, preferences.timezone);
    const timestampPatch =
      startTimestamp === null
        ? {}
        : {
            startTimestamp,
            endTimestamp: startTimestamp + entrySeconds * 1000,
          };
    const candidate: Omit<TimeEntry, "id"> = entry
      ? {
          date,
          start,
          end: effectiveEnd,
          endDate: effectiveEndDate !== date ? effectiveEndDate : undefined,
          seconds: entrySeconds,
          userId: entry.userId,
          projectId,
          task: task.trim(),
          description: cleanDescription,
          billable,
          ...timestampPatch,
        }
      : {
          date,
          start,
          end: effectiveEnd,
          endDate: effectiveEndDate !== date ? effectiveEndDate : undefined,
          seconds: entrySeconds,
          userId: currentUserId,
          projectId,
          task: task.trim(),
          ...(cleanDescription ? { description: cleanDescription } : {}),
          billable,
          ...timestampPatch,
        };
    const conflict = findEntryConflict(candidate, entry?.id);
    if (conflict) {
      setPendingEntry(candidate);
      return;
    }
    save(candidate);
  };

  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedClient = selectedProject
    ? clients.find((client) => client.id === selectedProject.clientId)
    : null;

  const formModal = (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden">
            <Modal.CloseTrigger />
            <ModalLayout.Header className="shrink-0">
              {t(entry ? "Edit time entry" : "Log time manually")}
            </ModalLayout.Header>
            <Form
              className="flex min-h-0 flex-1 flex-col overflow-visible"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <ModalLayout.Body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {saveError ? (
                  <FormAlert
                    title={t("We couldn't save this time entry")}
                    description={error(saveError)}
                  />
                ) : null}
                {manualTimerError ? (
                  <FormAlert
                    title={t("We couldn't add this manual entry")}
                    description={t(manualTimerError)}
                  />
                ) : null}

                <div className="flex min-w-0 items-end gap-3">
                  <TextField
                    isRequired
                    fullWidth
                    className="min-w-0 flex-1"
                    name="task"
                    value={task}
                    validate={(value) => (value.trim() ? null : t("Task is required"))}
                    onChange={(value) => {
                      setTask(value);
                      setSaveError(null);
                    }}
                  >
                    <Label>{t("Task")}</Label>
                    <Input variant="secondary" placeholder={t("e.g. Landing page revisions")} />
                    <FieldError />
                  </TextField>

                  <ToggleButtonGroup
                    aria-label={t("Billable")}
                    size="sm"
                    className="shrink-0 gap-0.5"
                    selectionMode="multiple"
                  >
                    <IconTooltip>
                      <ToggleButton
                        aria-label={t("Billable")}
                        className="size-9 min-h-9 min-w-9"
                        isIconOnly
                        isSelected={billable}
                        onChange={(selected: boolean) => setBillable(selected)}
                      >
                        <BillableIndicator billable={billable} mode="icon" size="md" />
                      </ToggleButton>
                    </IconTooltip>
                  </ToggleButtonGroup>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label>{t("Date")}</Label>
                    <HeroUIDatePicker
                      value={date}
                      label={t("Date")}
                      variant="secondary"
                      isInvalid={Boolean(dateError)}
                      onChange={(next) => {
                        setDate(next);
                        setSaveError(null);
                      }}
                    />
                    {dateError ? <FieldError>{dateError}</FieldError> : null}
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <Label>{t("Project")}</Label>
                    <ProjectSelect
                      ariaLabel={t("Project")}
                      value={projectId ?? "none"}
                      variant="secondary"
                      listClassName="max-h-60 overflow-y-auto"
                      allowArchivedId={entry?.projectId ?? null}
                      {...(can("manage-projects")
                        ? {
                            onCreateProject: (initialName: string) => {
                              setProjectInitialName(initialName);
                              setProjectFormOpen(true);
                            },
                          }
                        : {})}
                      onChange={(value) => {
                        const nextProjectId = value === "none" || value === "all" ? null : value;
                        setProjectId(nextProjectId);
                        if (!entry) {
                          setBillable(
                            nextProjectId === null
                              ? false
                              : (projects.find((project) => project.id === nextProjectId)
                                  ?.billable ?? false),
                          );
                        }
                        setSaveError(null);
                      }}
                    />
                    {selectedProject ? (
                      <Description className="text-xs">
                        {t("Client: {name}", {
                          name: selectedClient?.name ?? t("Unknown client"),
                        })}
                      </Description>
                    ) : null}
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={t("Time entry mode")}
                >
                  <Button
                    size="sm"
                    variant={timeMode === "range" ? "secondary" : "tertiary"}
                    onPress={() => setTimeMode("range")}
                  >
                    {t("Start / End")}
                  </Button>
                  <Button
                    size="sm"
                    variant={timeMode === "duration" ? "secondary" : "tertiary"}
                    onPress={() => setTimeMode("duration")}
                  >
                    {t("Duration")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField fullWidth name="start" type="time" value={start} onChange={setStart}>
                      <Label>{t("Start")}</Label>
                      <Input variant="secondary" />
                    </TextField>
                    {timeMode === "range" ? (
                      <TextField
                        fullWidth
                        name="end"
                        type="time"
                        value={end}
                        isInvalid={Boolean(timeError)}
                        onChange={setEnd}
                      >
                        <Label>{t("End")}</Label>
                        <Input variant="secondary" />
                        <FieldError>{timeError}</FieldError>
                      </TextField>
                    ) : (
                      <TextField
                        fullWidth
                        name="duration"
                        value={duration}
                        isInvalid={Boolean(timeError)}
                        onChange={setDuration}
                        validate={(value) =>
                          parseDurationInput(value) === null
                            ? t("Use H:MM, H:MM:SS, HHMM, HMM, 2h or Ns")
                            : null
                        }
                      >
                        <Label>{t("Duration")}</Label>
                        <Input variant="secondary" placeholder={t("e.g. 2:45, 00:00:49 or 45s")} />
                        <FieldError />
                      </TextField>
                    )}
                  </div>

                  <Description className="text-xs">
                    {t("Duration: {value}", {
                      value:
                        entrySeconds > 0
                          ? formatDuration(entrySeconds, locale)
                          : t("invalid range"),
                    })}
                  </Description>
                </div>

                <TextField
                  fullWidth
                  name="description"
                  value={description}
                  onChange={setDescription}
                >
                  <Label>{t("Notes")}</Label>
                  <TextArea
                    className="resize-none"
                    rows={3}
                    variant="secondary"
                    placeholder={t("Optional details")}
                  />
                  <Description className="text-xs">
                    {t("Keep useful context attached to this entry.")}
                  </Description>
                </TextField>
              </ModalLayout.Body>
              <ModalLayout.Footer className="shrink-0">
                <Button slot="close" type="button" variant="secondary">
                  {t("Cancel")}
                </Button>
                <Button type="submit" isDisabled={invalid}>
                  {t("Save entry")}
                </Button>
              </ModalLayout.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );

  return (
    <>
      {formModal}
      <ProjectFormModal
        isOpen={isOpen && projectFormOpen}
        initialName={projectInitialName}
        onOpenChange={setProjectFormOpen}
        onCreated={(project) => {
          setProjectId(project.id);
          if (!entry) setBillable(project.billable);
          setSaveError(null);
        }}
      />
      <OverlapConfirmation
        conflict={pendingEntry ? (findEntryConflict(pendingEntry, entry?.id) ?? null) : null}
        isOpen={pendingEntry !== null}
        onCancel={() => setPendingEntry(null)}
        onConfirm={() => {
          if (pendingEntry) save(pendingEntry);
        }}
      />
    </>
  );
}
