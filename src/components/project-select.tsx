import { Autocomplete } from "@heroui/react/autocomplete";
import { Button } from "@heroui/react/button";
import { EmptyState } from "@heroui/react/empty-state";
import { ListBox } from "@heroui/react/list-box";
import { SearchField } from "@heroui/react/search-field";
import { Separator } from "@heroui/react/separator";
import { Tooltip } from "@heroui/react/tooltip";
import { useFilter } from "@heroui/react/rac";
import { Plus } from "@gravity-ui/icons";
import { useId, useMemo, useRef, useState, type RefObject } from "react";
import { ProjectLabel } from "@/components/project-color";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export type ProjectSelectValue = "all" | "none" | string;

export interface ProjectSelectProps {
  value: ProjectSelectValue;
  onChange: (value: ProjectSelectValue) => void;
  includeAll?: boolean;
  required?: boolean;
  triggerRef?: RefObject<HTMLDivElement | null>;
  validationMessage?: string | null;
  onValidationDismiss?: () => void;
  allowArchivedId?: string | null;
  ariaLabel: string;
  variant?: "primary" | "secondary";
  listClassName?: string;
  showClientName?: boolean;
  trackerStyle?: boolean;
  onCreateProject?: (initialName: string) => void;
}

export function ProjectSelect({
  value,
  onChange,
  includeAll = false,
  required = false,
  triggerRef,
  validationMessage,
  onValidationDismiss,
  allowArchivedId = null,
  ariaLabel,
  variant = "secondary",
  listClassName = "max-h-72 overflow-y-auto",
  showClientName = false,
  trackerStyle = false,
  onCreateProject,
}: ProjectSelectProps) {
  const { projects, clients, canTrackProject } = useStore();
  const { t } = useI18n();
  const { contains } = useFilter({ sensitivity: "base" });
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const internalTriggerRef = useRef<HTMLDivElement>(null);
  const fieldRef = triggerRef ?? internalTriggerRef;
  const validationId = useId();

  const availableProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          (includeAll || canTrackProject(project.id) || project.id === value) &&
          (project.status !== "archived" || includeAll || project.id === allowArchivedId),
      ),
    [allowArchivedId, canTrackProject, includeAll, projects, value],
  );

  const clientNameFor = (clientId: string) =>
    clients.find((client) => client.id === clientId)?.name ?? t("Unknown client");
  const selectedProject = availableProjects.find((project) => project.id === value);

  return (
    <Autocomplete
      aria-label={ariaLabel}
      data-project-select
      isInvalid={Boolean(validationMessage)}
      fullWidth
      variant={variant}
      value={required && value === "none" ? null : value}
      placeholder={t("Select a project")}
      onChange={(key) => onChange(key === null ? "none" : String(key))}
      isOpen={isOpen}
      onOpenChange={(nextIsOpen) => {
        setIsOpen(nextIsOpen);
        if (nextIsOpen) onValidationDismiss?.();
        if (!nextIsOpen) setSearchValue("");
      }}
    >
      <Autocomplete.Trigger
        ref={fieldRef}
        {...(validationMessage ? { "aria-describedby": validationId } : {})}
        className="h-9 w-full min-w-0 items-center gap-2"
      >
        <Autocomplete.Value className="min-w-0 flex-1">
          {({ defaultChildren }) =>
            showClientName && selectedProject ? (
              <span
                className="flex min-w-0 items-center gap-2"
                title={`${selectedProject.name} — ${clientNameFor(selectedProject.clientId)}`}
              >
                <ProjectLabel
                  className="max-w-[60%] shrink-0"
                  project={selectedProject}
                  label={selectedProject.name}
                />
                <span className="min-w-0 truncate text-xs text-muted">
                  {clientNameFor(selectedProject.clientId)}
                </span>
              </span>
            ) : (
              defaultChildren
            )
          }
        </Autocomplete.Value>
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Tooltip
        isOpen={Boolean(validationMessage) && !isOpen}
        onOpenChange={(open) => {
          if (!open) onValidationDismiss?.();
        }}
      >
        <Tooltip.Content
          triggerRef={fieldRef}
          placement="bottom"
          showArrow
          className="max-w-xs break-words"
        >
          <span id={validationId}>{validationMessage}</span>
        </Tooltip.Content>
      </Tooltip>
      <Autocomplete.Popover
        className={`w-64 max-w-[calc(100vw-2rem)] min-w-0 ${trackerStyle ? "tracker-project-menu" : ""}`}
        containerPadding={12}
        shouldFlip
        data-project-select-popover
      >
        <div className="project-select-content flex flex-col gap-2 p-2">
          <Autocomplete.Filter
            filter={contains}
            inputValue={searchValue}
            onInputChange={setSearchValue}
          >
            <SearchField
              autoFocus
              aria-label={t("Search projects")}
              name={`project-search-${ariaLabel.toLowerCase().replace(/\s+/g, "-")}`}
              variant="secondary"
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={`${t("Search projects")}...`} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <ListBox
              aria-label={t("Projects")}
              className={listClassName}
              renderEmptyState={() => <EmptyState>{t("No projects found")}</EmptyState>}
            >
              {includeAll ? (
                <ListBox.Item id="all" textValue={t("All projects")}>
                  {t("All projects")}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ) : null}
              {!required ? (
                <ListBox.Item id="none" textValue={t("No project")}>
                  {t("No project")}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ) : null}

              {availableProjects.map((project) => (
                <ListBox.Item
                  key={project.id}
                  id={project.id}
                  textValue={`${project.name} ${clientNameFor(project.clientId)}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <ProjectLabel project={project} label={project.name} />
                    {showClientName ? (
                      <span className="truncate text-xs leading-4 text-muted">
                        {clientNameFor(project.clientId)}
                      </span>
                    ) : null}
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Autocomplete.Filter>
          {onCreateProject ? (
            <>
              <Separator />
              <Button
                fullWidth
                variant={trackerStyle ? "primary" : "tertiary"}
                className={trackerStyle ? "justify-center" : "justify-start"}
                onPress={() => {
                  const initialName = searchValue.trim();
                  setIsOpen(false);
                  setSearchValue("");
                  onCreateProject(initialName);
                }}
              >
                <Plus aria-hidden="true" className="size-4" />
                {t("Create new project")}
              </Button>
            </>
          ) : null}
        </div>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
