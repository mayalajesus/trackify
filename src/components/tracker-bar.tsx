import { IconTooltip } from "@/components/icon-tooltip";
import { Card } from "@heroui/react/card";
import { ComboBox } from "@heroui/react/combo-box";
import { EmptyState } from "@heroui/react/empty-state";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Separator } from "@heroui/react/separator";
import { ToggleButton } from "@heroui/react/toggle-button";
import { ToggleButtonGroup } from "@heroui/react/toggle-button-group";
import { Toolbar } from "@heroui/react/toolbar";
import { toast } from "@/lib/toast";
import { Button } from "@heroui/react/button";
import { useFavoriteTasks } from "@/lib/use-favorite-tasks";
import { type FavoriteTask } from "@/lib/favorite-tasks";
import {
  Star,
  StarFill,
  Square,
  Thunderbolt,
  ThunderboltFill,
  PersonPlus,
  LayoutColumns,
} from "@gravity-ui/icons";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { ActionDropdown } from "@/components/action-dropdown";
import { TrackerTaskModal } from "@/components/tracker-task-modal";
import type { TaskDetails } from "@/lib/domain";
import { FormAlert } from "@/components/form-feedback";
import { formatOverlapConflict } from "@/components/overlap-confirmation";
import { ProjectFormModal, type CreatedProjectSelection } from "@/components/project-form-modal";
import { ProjectSelect } from "@/components/project-select";
import { TimerActionButton } from "@/components/timer-action-button";
import { TimerDurationEditor } from "@/components/timer-duration-editor";
import { TimerStartEditor } from "@/components/timer-start-editor";
import { TimerNoteModal } from "@/components/timer-note-modal";
import { TimerCompletionModal } from "@/components/timer-completion-modal";
import { Comment } from "@gravity-ui/icons";
import { useI18n } from "@/lib/i18n";
import { useStore, useTimerTicker } from "@/lib/store";
import { focusTimerTaskInput } from "@/lib/timer-input";

export interface TrackerBarHandle {
  selectFavorite: (favorite: FavoriteTask) => void;
}

export function TrackerBar({ ref }: { ref?: Ref<TrackerBarHandle> }) {
  const {
    timer,
    currentMember,
    activeWorkspaceId,
    entries,
    projects,
    can,
    startTimer,
    updateTimer,
    setTimerElapsed,
    pauseTimer,
    resumeTimer,
    stopTimer,
  } = useStore();
  const { isFavorite, toggleFavorite } = useFavoriteTasks();
  const { elapsed } = useTimerTicker();
  const { locale, t, error } = useI18n();
  const [task, setTask] = useState("");
  const [taskInputVersion, setTaskInputVersion] = useState(0);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const projectTriggerRef = useRef<HTMLDivElement>(null);
  const [projectValidationVisible, setProjectValidationVisible] = useState(false);
  const [activeTask, setActiveTask] = useState(timer.task);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [billable, setBillable] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectInitialName, setProjectInitialName] = useState("");
  const [pendingCreatedProject, setPendingCreatedProject] =
    useState<CreatedProjectSelection | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskDetails>(() => ({
    id: crypto.randomUUID(),
    urgent: false,
  }));
  const [taskModal, setTaskModal] = useState<"members" | "trello" | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const active = timer.status !== "idle";
  const details = active ? (timer.taskDetails ?? taskDetails) : taskDetails;
  const changeDetails = (next: TaskDetails) => {
    setTaskDetails(next);
    if (active) updateActiveTimer({ taskDetails: next });
  };
  useEffect(() => {
    setTaskDetails({ id: crypto.randomUUID(), urgent: false });
    setTaskModal(null);
    setNoteOpen(false);
    setCompletionOpen(false);
  }, [activeWorkspaceId]);
  const taskSuggestions = useMemo(() => {
    const uniqueTasks = new Map<string, string>();

    entries.forEach((entry) => {
      const entryTask = entry.task.trim();
      if (!entryTask) return;

      const normalizedTask = entryTask.toLocaleLowerCase(locale);
      if (!uniqueTasks.has(normalizedTask)) uniqueTasks.set(normalizedTask, entryTask);
    });

    return Array.from(uniqueTasks.values()).sort((left, right) =>
      left.localeCompare(right, locale, { sensitivity: "base" }),
    );
  }, [entries, locale]);

  useEffect(() => {
    setActiveTask(active ? timer.task : "");
  }, [active, timer.task]);

  const updateActiveTimer = (patch: Parameters<typeof updateTimer>[0]) => {
    const result = updateTimer(patch);
    setTimerError(result.success ? null : result.error);
  };

  useEffect(() => {
    if (!pendingCreatedProject) return;
    if (!projects.some((project) => project.id === pendingCreatedProject.id)) return;

    if (timer.status !== "idle") {
      const result = updateTimer({ projectId: pendingCreatedProject.id });
      setTimerError(result.success ? null : result.error);
    } else {
      setProjectId(pendingCreatedProject.id);
      setBillable(pendingCreatedProject.billable);
    }
    setPendingCreatedProject(null);
  }, [pendingCreatedProject, projects, timer.status, updateTimer]);

  const updateTaskValue = (value: string) => {
    taskInputRef.current?.setCustomValidity("");
    if (!active) {
      setTask(value);
      return;
    }

    setActiveTask(value);
    if (value.trim()) updateActiveTimer({ task: value });
  };

  const currentTask = {
    task: active ? activeTask : task,
    projectId: active ? timer.projectId : projectId,
    billable: active ? timer.billable : billable,
  };
  const selectFavorite = (favorite: FavoriteTask) => {
    if (active) return;
    if (
      !projects.some((project) => project.id === favorite.projectId && project.status === "active")
    )
      return;
    setTaskDetails({ id: crypto.randomUUID(), urgent: false });
    setTask(favorite.task);
    setProjectId(favorite.projectId);
    setBillable(favorite.billable);
    setTimerError(null);
    setProjectValidationVisible(false);
    taskInputRef.current?.setCustomValidity("");
    taskInputRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({ selectFavorite }));

  return (
    <div className="flex min-w-0 flex-col gap-3" data-tracker-bar>
      <Card
        className="tracker-timer w-full gap-0 rounded-3xl p-1.5 lg:rounded-full"
        variant="default"
      >
        <Toolbar
          aria-label={t("Timer")}
          data-status={timer.status}
          orientation="horizontal"
          className="grid w-full max-w-full grid-cols-1 items-center gap-3 lg:grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,15rem)_auto_auto_auto]"
        >
          <ComboBox
            key={taskInputVersion}
            isRequired
            allowsCustomValue
            className="min-w-0"
            fullWidth
            inputValue={active ? activeTask : task}
            menuTrigger="input"
            name="timer-task"
            variant="secondary"
            onInputChange={updateTaskValue}
            onSelectionChange={(key) => {
              if (key !== null) updateTaskValue(String(key));
            }}
          >
            <Label className="sr-only">{t("What are you working on?")}</Label>
            <ComboBox.InputGroup className="w-full">
              <Input
                ref={taskInputRef}
                data-timer-task-input
                className="rounded-xl !pe-3"
                placeholder={t("What are you working on?")}
                variant="secondary"
                onBlur={() => {
                  if (!active) return;
                  if (activeTask.trim()) {
                    updateActiveTimer({ task: activeTask });
                  } else if (timer.task.trim()) {
                    setActiveTask(timer.task);
                    setTimerError(t("A task is required."));
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <ComboBox.Trigger aria-label={t("What are you working on?")} className="hidden" />
            </ComboBox.InputGroup>
            <ComboBox.Popover className="max-h-60">
              <ListBox
                aria-label={t("Tasks")}
                className="max-h-60 overflow-y-auto"
                renderEmptyState={() => <EmptyState>{t("No tasks found")}</EmptyState>}
              >
                {taskSuggestions.map((suggestion) => (
                  <ListBox.Item key={suggestion} id={suggestion} textValue={suggestion}>
                    {suggestion}
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>

          <Separator orientation="vertical" className="hidden h-6 lg:block" />

          <div className="tracker-project-field min-w-0">
            <Label className="sr-only">{t("Project")}</Label>
            <ProjectSelect
              trackerStyle
              groupByClient
              required
              triggerRef={projectTriggerRef}
              validationMessage={
                projectValidationVisible && !(active ? timer.projectId : projectId)
                  ? t("Select a project before starting the timer.")
                  : null
              }
              onValidationDismiss={() => setProjectValidationVisible(false)}
              ariaLabel={t("Project")}
              value={(active ? timer.projectId : projectId) ?? "none"}
              allowArchivedId={active ? timer.projectId : null}
              variant="secondary"
              showClientName
              {...(can("manage-projects")
                ? {
                    onCreateProject: (initialName: string) => {
                      setProjectInitialName(initialName);
                      setProjectFormOpen(true);
                    },
                  }
                : {})}
              onChange={(value) => {
                setProjectValidationVisible(false);
                const nextProjectId = value === "none" || value === "all" ? null : value;
                if (active) {
                  updateActiveTimer({ projectId: nextProjectId });
                } else {
                  setProjectId(nextProjectId);
                  setBillable(
                    nextProjectId === null
                      ? false
                      : (projects.find((project) => project.id === nextProjectId)?.billable ??
                          false),
                  );
                }
              }}
            />
          </div>

          <div className="tracker-task-actions flex items-center gap-3">
            <IconTooltip>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-7 min-w-7"
                aria-label={t(
                  isFavorite(currentTask) ? "Remove from favorites" : "Add to favorites",
                )}
                aria-pressed={isFavorite(currentTask)}
                onPress={() => toggleFavorite(currentTask)}
              >
                {isFavorite(currentTask) ? (
                  <StarFill className="size-4 text-warning" />
                ) : (
                  <Star className="size-4" />
                )}
              </Button>
            </IconTooltip>

            <IconTooltip>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-7 min-w-7"
                aria-label={t(details.urgent ? "Unmark urgent" : "Mark urgent")}
                aria-pressed={details.urgent}
                onPress={() => changeDetails({ ...details, urgent: !details.urgent })}
              >
                {details.urgent ? (
                  <ThunderboltFill className="size-4 text-danger" />
                ) : (
                  <Thunderbolt className="size-4" />
                )}
              </Button>
            </IconTooltip>
            <ActionDropdown
              menuClassName="tracker-action-menu"
              ariaLabel={t("Task actions")}
              orientation="vertical"
              items={[
                {
                  id: "note",
                  icon: <Comment className="size-4" />,
                  label: t(details.description ? "Edit description" : "Add a note"),
                },
                { id: "members", label: t("Add members"), icon: <PersonPlus className="size-4" /> },
                {
                  id: "trello",
                  label: t("Link to Trello"),
                  icon: <LayoutColumns className="size-4 text-[#0052CC]" />,
                },
              ]}
              onAction={(key) => {
                if (key === "note") {
                  setNoteOpen(true);
                  return;
                }
                if (!currentTask.task.trim()) {
                  focusTimerTaskInput(t("A task is required."));
                  return;
                }
                if (!currentTask.projectId) {
                  setProjectValidationVisible(true);
                  return;
                }
                setTaskModal(key === "members" ? "members" : "trello");
              }}
            />
          </div>
          {noteOpen ? (
            <TimerNoteModal
              key={`${active ? "active" : "draft"}-${details.id}`}
              taskDetails={details}
              readOnly={Boolean(
                active &&
                timer.collaborationOwnerId &&
                timer.collaborationOwnerId !== currentMember?.id,
              )}
              onSave={(next) => {
                if (active) return updateTimer({ taskDetails: next });
                setTaskDetails(next);
                return { success: true };
              }}
              onClose={() => setNoteOpen(false)}
            />
          ) : null}
          <Separator orientation="vertical" className="hidden h-6 lg:block" />

          <div className="tracker-time-group flex items-center gap-1.5 justify-end">
            {active ? (
              <TimerStartEditor />
            ) : (
              <TimerDurationEditor
                elapsed={elapsed}
                isReadOnly={!active}
                onElapsedChange={(seconds) => {
                  const result = setTimerElapsed(seconds);
                  setTimerError(result.success ? null : result.error);
                }}
              />
            )}

            <div role="group" aria-label={t("Timer")} className="flex shrink-0 items-center gap-1">
              <TimerActionButton
                status={timer.status}
                onPress={() => {
                  if (timer.status === "idle") {
                    const result = startTimer(task, projectId, billable, taskDetails);
                    setTimerError(result.success ? null : result.error);
                    return;
                  }

                  if (timer.status === "running") pauseTimer();
                  else {
                    const result = resumeTimer();
                    setTimerError(result.success ? null : result.error);
                  }
                }}
              />

              {timer.status !== "idle" ? (
                <ToggleButtonGroup
                  aria-label={t("Timer")}
                  size="sm"
                  className="shrink-0 gap-0.5"
                  selectionMode="multiple"
                >
                  <IconTooltip>
                    <ToggleButton
                      aria-label={t(
                        timer.collaborationOwnerId &&
                          timer.collaborationOwnerId !== currentMember?.id
                          ? "Only the person who started this shared task can stop it."
                          : "Stop",
                      )}
                      isDisabled={Boolean(
                        timer.collaborationOwnerId &&
                        timer.collaborationOwnerId !== currentMember?.id,
                      )}
                      className="size-9 min-h-9 min-w-9 bg-danger text-danger-foreground data-[hovered=true]:bg-danger/90"
                      isIconOnly
                      isSelected={false}
                      onPress={() => {
                        const result = stopTimer();
                        if (!result.success) {
                          if (!timer.task.trim() || !timer.projectId) {
                            setTimerError(null);
                            setCompletionOpen(true);
                            return;
                          }
                          setTimerError(result.error);
                          return;
                        }
                        if (result.warning) {
                          toast.info(t("Overlapping time"), {
                            description: result.conflict
                              ? formatOverlapConflict(result.conflict, locale)
                              : error(result.warning),
                          });
                        }
                        setTaskDetails({ id: crypto.randomUUID(), urgent: false });
                        // Reset the combobox's internal selection/open state along with the draft.
                        setTaskInputVersion((version) => version + 1);
                        setTask("");
                        setTimerError(null);
                        setActiveTask("");
                        setProjectId(null);
                      }}
                    >
                      <Square aria-hidden="true" />
                    </ToggleButton>
                  </IconTooltip>
                </ToggleButtonGroup>
              ) : null}
            </div>
          </div>
        </Toolbar>
      </Card>

      {timerError ? (
        <FormAlert title={t("We couldn't update the timer")} description={error(timerError)} />
      ) : null}

      {completionOpen && active && (
        <TimerCompletionModal onClose={() => setCompletionOpen(false)} />
      )}
      <TrackerTaskModal
        mode={taskModal}
        onClose={() => setTaskModal(null)}
        task={currentTask.task}
        projectId={currentTask.projectId}
        details={details}
        onDetailsChange={changeDetails}
        onBeforeInvite={() => {
          if (active) return true;
          const result = startTimer(task, projectId, undefined, details);
          setTimerError(result.success ? null : result.error);
          return result.success;
        }}
      />
      <ProjectFormModal
        isOpen={projectFormOpen}
        initialName={projectInitialName}
        onOpenChange={(open) => {
          setProjectFormOpen(open);
          if (!open) setProjectInitialName("");
        }}
        onCreated={setPendingCreatedProject}
      />
    </div>
  );
}
