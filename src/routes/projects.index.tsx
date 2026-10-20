import { AlertDialog } from "@heroui/react/alert-dialog";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Dropdown } from "@heroui/react/dropdown";
import { Table } from "@heroui/react/table";
import { Typography } from "@heroui/react/typography";
import { toast } from "@/lib/toast";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowRotateLeft,
  ChevronDown,
  CircleDollar,
  Copy,
  Folder,
  Pencil,
  Plus,
  Power,
  TrashBin,
} from "@gravity-ui/icons";
import { useState } from "react";
import { ActionDropdown } from "@/components/action-dropdown";
import { BillableIndicator } from "@/components/billable-indicator";
import { DataTable } from "@/components/data-table";
import { useTablePagination } from "@/lib/use-table-pagination";
import { PageHeader } from "@/components/page-header";
import { ProjectLabel } from "@/components/project-color";
import { RouterLink } from "@/components/router-link";
import { FormAlert } from "@/components/form-feedback";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { ProjectFormModal } from "@/components/project-form-modal";
import { EmptyBlock } from "@/components/states";
import { formatDate, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Project } from "@/lib/domain";
import { projectColorValue } from "@/lib/project-colors";
import { useStore } from "@/lib/store";
import { sortClientsByName } from "@/lib/client-order";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Trackify" },
      {
        name: "description",
        content: "Track hours per project, monitor status and open detailed project breakdowns.",
      },
      { property: "og:title", content: "Projects — Trackify" },
      {
        property: "og:description",
        content: "All client and internal projects with tracked time at a glance.",
      },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const {
    projects,
    clients,
    entries,
    today,
    can,
    addProject,
    updateProject,
    deleteProject,
    activeWorkspaceId,
  } = useStore();
  const { locale, t, error } = useI18n();
  const [filter, setFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<Project | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingDeleteHasEntries = pendingDelete
    ? entries.some((entry) => entry.projectId === pendingDelete.id)
    : false;

  const visible = projects.filter((p) => {
    return (
      (filter === "all" || p.status === filter) &&
      (clientFilter === "all" || p.clientId === clientFilter)
    );
  });
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const projectPage = useTablePagination(
    visible,
    JSON.stringify([activeWorkspaceId, filter, clientFilter]),
  );
  const projectSeconds = (id: string) =>
    entries.filter((e) => e.projectId === id).reduce((sum, e) => sum + e.seconds, 0);

  const openProjectForm = (project?: Project) => {
    setEditingProject(project ?? null);
    setNewOpen(true);
  };

  const closeProjectForm = () => {
    setNewOpen(false);
    setEditingProject(null);
  };

  const duplicateProject = (project: Project) => {
    const { id: _id, status: _status, ...copy } = project;
    const result = addProject({
      ...copy,
      name: t("Copy of {name}", { name: project.name }),
      color: projectColorValue(project.color),
      status: "active",
      lastActivity: today,
    });
    if (!result.success) {
      setStatusError(error(result.error));
      return;
    }
    setStatusError(null);
    toast.success(t("Project duplicated"), { description: project.name });
  };

  const setProjectStatus = (project: Project, nextStatus: "active" | "on-hold") => {
    const result = updateProject(project.id, { status: nextStatus });
    if (!result.success) {
      setStatusError(error(result.error));
      return;
    }
    setStatusError(null);
    toast.success(t(nextStatus === "on-hold" ? "Project deactivated" : "Project is active again"), {
      description: project.name,
    });
  };

  const restoreProject = (project: Project) => {
    const result = updateProject(project.id, { status: "active" });
    if (!result.success) {
      setStatusError(error(result.error));
      return;
    }
    setStatusError(null);
    toast.success(t("Project is active again"), { description: project.name });
  };

  const toggleProjectBillable = (project: Project) => {
    const result = updateProject(project.id, { billable: !project.billable });
    if (!result.success) {
      setStatusError(error(result.error));
      return;
    }
    setStatusError(null);
    toast.success(t(project.billable ? "Project is internal now" : "Project is billable now"), {
      description: project.name,
    });
  };

  const archiveProject = () => {
    if (!pendingArchive) return;
    const result = updateProject(pendingArchive.id, { status: "archived" });
    if (!result.success) {
      setStatusError(error(result.error));
      return;
    }
    toast.success(t("Project archived"), { description: pendingArchive.name });
    setStatusError(null);
    setPendingArchive(null);
  };

  const deleteProjectPermanently = () => {
    if (!pendingDelete) return;
    const result = deleteProject(pendingDelete.id);
    if (!result.success) {
      setDeleteError(error(result.error));
      return;
    }
    toast.success(t("Project deleted"), { description: pendingDelete.name });
    setDeleteError(null);
    setPendingDelete(null);
  };

  const projectFilterOptions = [
    { id: "all", label: t("All") },
    { id: "active", label: t("Active") },
    { id: "archived", label: t("Archived") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Projects")}
        description={t("Time tracked per project across the workspace.")}
        actions={
          <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 sm:flex-wrap sm:gap-2">
            <Dropdown>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                aria-label={t("Filter projects")}
                className="h-9 min-w-0 shrink-0 justify-between gap-1 px-2 text-xs sm:min-w-28 sm:gap-2 sm:px-3 sm:text-sm"
              >
                {projectFilterOptions.find((option) => option.id === filter)?.label}
                <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label={t("Filter projects")}
                  selectionMode="single"
                  selectedKeys={new Set([filter])}
                  onAction={(key) => setFilter(String(key))}
                >
                  {projectFilterOptions.map((option) => (
                    <Dropdown.Item key={option.id} id={option.id} textValue={option.label}>
                      <Label>{option.label}</Label>
                      <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <Dropdown>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                aria-label={t("Filter by client")}
                className="h-9 max-w-56 min-w-0 shrink justify-between gap-1 px-2 text-xs sm:min-w-28 sm:gap-2 sm:px-3 sm:text-sm"
              >
                <span className="min-w-0 truncate">
                  {clientFilter === "all" ? t("All clients") : clientName(clientFilter)}
                </span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label={t("Filter by client")}
                  selectionMode="single"
                  selectedKeys={new Set([clientFilter])}
                  onAction={(key) => setClientFilter(String(key))}
                  className="max-h-72 overflow-y-auto"
                >
                  <Dropdown.Item id="all" textValue={t("All clients")}>
                    <Label>{t("All clients")}</Label>
                    <Dropdown.ItemIndicator />
                  </Dropdown.Item>
                  {sortClientsByName(clients, locale).map((client) => (
                    <Dropdown.Item key={client.id} id={client.id} textValue={client.name}>
                      <Label>{client.name}</Label>
                      <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            {can("manage-projects") ? (
              <Button
                className="h-9 min-w-0 shrink-0 gap-1 px-2 text-xs sm:h-10 sm:gap-2 sm:px-4 sm:text-sm"
                onPress={() => openProjectForm()}
              >
                <Plus className="size-4" />
                {t("New project")}
              </Button>
            ) : null}
          </div>
        }
      />

      {statusError ? (
        <FormAlert title={t("We couldn't update this project")} description={statusError} />
      ) : null}

      {visible.length === 0 ? (
        <EmptyBlock
          icon={<Folder className="size-5" />}
          title={t("No projects here")}
          description={t("Change the filters or create a new project to get started.")}
          action={
            can("manage-projects") ? (
              <Button size="sm" variant="secondary" onPress={() => openProjectForm()}>
                {t("New project")}
              </Button>
            ) : null
          }
        />
      ) : (
        <DataTable
          label={t("Projects")}
          pagination={projectPage.pagination}
          minWidth="min-w-[820px]"
          scrollHint={t("Scroll horizontally to see all columns")}
        >
          <Table.Header>
            <Table.Column isRowHeader>{t("Project")}</Table.Column>
            <Table.Column>{t("Client")}</Table.Column>
            <Table.Column>{t("Status")}</Table.Column>
            <Table.Column>{t("Billing")}</Table.Column>
            {can("view-all-reports") ? <Table.Column>{t("Tracked")}</Table.Column> : null}
            <Table.Column>{t("Last activity")}</Table.Column>
            <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
          </Table.Header>
          <Table.Body>
            {projectPage.items.map((project) => (
              <Table.Row key={project.id}>
                <Table.Cell>
                  <RouterLink
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="block max-w-64"
                  >
                    <ProjectLabel project={project} label={project.name} />
                  </RouterLink>
                </Table.Cell>
                <Table.Cell className="max-w-52 truncate">
                  {clientName(project.clientId)}
                </Table.Cell>
                <Table.Cell>
                  <Chip size="sm" variant="secondary" color="default">
                    {t(
                      project.status === "on-hold"
                        ? "Inactive"
                        : project.status === "archived"
                          ? "Archived"
                          : "Active",
                    )}
                  </Chip>
                </Table.Cell>
                <Table.Cell>
                  <BillableIndicator billable={project.billable} />
                </Table.Cell>
                {can("view-all-reports") ? (
                  <Table.Cell className="whitespace-nowrap">
                    {formatDuration(projectSeconds(project.id), locale)}
                  </Table.Cell>
                ) : null}
                <Table.Cell className="whitespace-nowrap">
                  {formatDate(project.lastActivity, locale)}
                </Table.Cell>
                <Table.Cell>
                  {can("manage-projects") ? (
                    <div className="flex justify-end">
                      <ActionDropdown
                        ariaLabel={t("{kind} actions for {name}", {
                          kind: project.status === "archived" ? t("Archived") : t("Project"),
                          name: project.name,
                        })}
                        items={[
                          {
                            id: "edit",
                            label: t("Edit project"),
                            icon: <Pencil className="size-4" />,
                          },
                          {
                            id: "duplicate",
                            label: t("Duplicate project"),
                            icon: <Copy className="size-4" />,
                          },
                          ...(project.status === "archived"
                            ? []
                            : [
                                {
                                  id: project.status === "active" ? "deactivate" : "activate",
                                  label: project.status === "active" ? t("Active") : t("Inactive"),
                                  icon: <Power className="size-4" />,
                                  isSelected: project.status === "active",
                                },
                              ]),
                          {
                            id: "billable",
                            label: project.billable ? t("Make internal") : t("Make billable"),
                            icon: <CircleDollar className="size-4" />,
                          },
                          ...(project.status === "archived"
                            ? [
                                {
                                  id: "restore",
                                  label: t("Restore project"),
                                  icon: <ArrowRotateLeft className="size-4" />,
                                },
                                {
                                  id: "delete",
                                  label: t("Delete project"),
                                  icon: <TrashBin className="size-4" />,
                                  tone: "danger" as const,
                                },
                              ]
                            : [
                                {
                                  id: "archive",
                                  label: t("Archive project"),
                                  icon: <Archive className="size-4" />,
                                  tone: "warning" as const,
                                },
                              ]),
                        ]}
                        onAction={(key) => {
                          if (key === "edit") openProjectForm(project);
                          if (key === "duplicate") duplicateProject(project);
                          if (key === "deactivate") setProjectStatus(project, "on-hold");
                          if (key === "activate") setProjectStatus(project, "active");
                          if (key === "billable") toggleProjectBillable(project);
                          if (key === "archive") setPendingArchive(project);
                          if (key === "restore") restoreProject(project);
                          if (key === "delete") {
                            setDeleteError(null);
                            setPendingDelete(project);
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </DataTable>
      )}

      <Modal
        isOpen={pendingArchive !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingArchive(null);
            setStatusError(null);
          }
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Archive project?")}</ModalLayout.Header>
              <ModalLayout.Body>
                {statusError ? (
                  <FormAlert
                    title={t("We couldn't archive this project")}
                    description={statusError}
                  />
                ) : null}
                <Typography type="body-sm" color="muted">
                  {t(
                    "{name} will leave Active and Inactive lists. Existing time entries will remain available in reports and history.",
                    {
                      name: pendingArchive?.name ?? t("This project"),
                    },
                  )}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary" className="text-foreground">
                  {t("Cancel")}
                </Button>
                <Button
                  variant="primary"
                  className="project-archive-button"
                  onPress={archiveProject}
                >
                  {t("Archive project")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <AlertDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialog.Trigger aria-label={t("Delete project")} className="sr-only" tabIndex={-1} />
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="trackify-alert-dialog">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>{t("Delete project permanently?")}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {deleteError ? (
                  <FormAlert
                    title={t("We couldn't delete this project")}
                    description={deleteError}
                  />
                ) : null}
                <Typography type="body-sm" color="muted">
                  {pendingDeleteHasEntries
                    ? error(
                        "This project has tracked time. Keep it archived to preserve reports and history.",
                      )
                    : t("This permanently deletes {name}. This action cannot be undone.", {
                        name: pendingDelete?.name ?? t("This project"),
                      })}
                </Typography>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="secondary">
                  {t("Cancel")}
                </Button>
                <Button
                  variant="danger"
                  isDisabled={pendingDeleteHasEntries}
                  onPress={deleteProjectPermanently}
                >
                  {t("Delete project")}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      <ProjectFormModal
        isOpen={newOpen}
        project={editingProject}
        onOpenChange={(open) => {
          if (open) setNewOpen(true);
          else closeProjectForm();
        }}
      />
    </div>
  );
}
