import { EntryTrelloModal } from "@/components/entry-trello-modal";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { Typography } from "@heroui/react/typography";
import { toast } from "@/lib/toast";
import { Pencil, TrashBin, Thunderbolt, LayoutColumns, PersonPlus } from "@gravity-ui/icons";
import { BillableIndicator } from "@/components/billable-indicator";
import { ProjectLabel } from "@/components/project-color";
import { useState } from "react";
import { ActionDropdown } from "@/components/action-dropdown";
import { DataTable } from "@/components/data-table";
import { LogTimeModal } from "@/components/log-time-modal";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { useStore } from "@/lib/store";
import { formatDate, formatDuration, getEntryEndDayOffset } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TimeEntry } from "@/lib/domain";

export function EntriesTable({
  entries,
  showDate = false,
  showMember = false,
}: {
  entries: TimeEntry[];
  showDate?: boolean;
  showMember?: boolean;
}) {
  const { projects, members, currentUserId, deleteEntry, restoreEntry, updateEntry } = useStore();
  const { locale, t, error } = useI18n();
  const [entryTaskMode, setEntryTaskMode] = useState<"trello" | "members">("trello");
  const [trelloEntry, setTrelloEntry] = useState<TimeEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deletedEntry = pendingDelete;
    deleteEntry(deletedEntry.id);
    setPendingDelete(null);
    toast.info(t("Time entry moved to trash"), {
      description: `${deletedEntry.task} · ${formatDuration(deletedEntry.seconds, locale)}`,
      timeout: 20_000,
      actionProps: {
        children: t("Undo"),
        onPress: () => {
          const result = restoreEntry(deletedEntry);
          if (!result.success)
            toast.danger(t("We couldn't restore this time entry"), {
              description: error(result.error),
            });
        },
      },
    });
  };

  const projectFor = (id: string | null) => (id ? projects.find((p) => p.id === id) : null);
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "—";

  return (
    <>
      <DataTable label={t("Time entries")} minWidth="min-w-[720px]">
        <Table.Header>
          <Table.Column isRowHeader>{t("Task")}</Table.Column>
          <Table.Column>{t("Project")}</Table.Column>
          {showMember ? <Table.Column>{t("Member")}</Table.Column> : null}
          {showDate ? <Table.Column>{t("Date")}</Table.Column> : null}
          <Table.Column>{t("Time")}</Table.Column>
          <Table.Column>{t("Duration")}</Table.Column>
          <Table.Column>{t("Billable")}</Table.Column>
          <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
        </Table.Header>
        <Table.Body>
          {entries.map((entry) => {
            const isOwnEntry = entry.userId === currentUserId;
            return (
              <Table.Row key={entry.id}>
                <Table.Cell>
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2">
                      {entry.taskDetails?.urgent ? (
                        <Thunderbolt
                          className="size-3.5 shrink-0 text-danger"
                          aria-label={t("Urgent")}
                        />
                      ) : null}
                      {entry.task}
                    </span>
                    {entry.description ? <span>{entry.description}</span> : null}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <ProjectLabel
                    project={projectFor(entry.projectId) ?? null}
                    label={
                      projectFor(entry.projectId)?.name ??
                      t(entry.projectId === null ? "No project" : "Unknown project")
                    }
                  />
                </Table.Cell>
                {showMember ? <Table.Cell>{memberName(entry.userId)}</Table.Cell> : null}
                {showDate ? <Table.Cell>{formatDate(entry.date, locale)}</Table.Cell> : null}
                <Table.Cell>
                  {entry.start} – {entry.end}
                  {getEntryEndDayOffset(entry) > 0 ? (
                    <sup className="ml-1">+{getEntryEndDayOffset(entry)}</sup>
                  ) : null}
                </Table.Cell>
                <Table.Cell>{formatDuration(entry.seconds, locale)}</Table.Cell>
                <Table.Cell>
                  {entry.billable ? <BillableIndicator billable mode="icon" /> : null}
                </Table.Cell>
                <Table.Cell>
                  {isOwnEntry ? (
                    <div className="flex justify-end gap-1">
                      <ActionDropdown
                        ariaLabel={t("Entry actions")}
                        items={[
                          {
                            id: "members",
                            label: t("Add members"),
                            icon: <PersonPlus className="size-4" />,
                          },
                          {
                            id: "trello",
                            label: t("Link to Trello"),
                            icon: <LayoutColumns className="size-4" />,
                          },
                          {
                            id: "urgent",
                            label: t(entry.taskDetails?.urgent ? "Unmark urgent" : "Mark urgent"),
                            icon: <Thunderbolt className="size-4" />,
                          },
                          {
                            id: "edit",
                            label: t("Edit entry"),
                            icon: <Pencil className="size-4" />,
                          },
                          {
                            id: "delete",
                            label: t("Delete entry"),
                            icon: <TrashBin className="size-4" />,
                            tone: "danger",
                          },
                        ]}
                        onAction={(key) => {
                          if (key === "trello" || key === "members") {
                            setEntryTaskMode(key);
                            setTrelloEntry(entry);
                          }
                          if (key === "urgent") {
                            const result = updateEntry(entry.id, {
                              taskDetails: {
                                id: entry.taskDetails?.id ?? crypto.randomUUID(),
                                ...entry.taskDetails,
                                urgent: !entry.taskDetails?.urgent,
                              },
                            });
                            if (!result.success) {
                              toast.danger(t("Unable to save urgency"), {
                                description: error(result.error),
                              });
                            }
                          }
                          if (key === "edit") setEditingEntry(entry);
                          if (key === "delete") setPendingDelete(entry);
                        }}
                      />
                    </div>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </DataTable>
      {trelloEntry ? (
        <EntryTrelloModal
          mode={entryTaskMode}
          entries={[trelloEntry]}
          onClose={() => setTrelloEntry(null)}
        />
      ) : null}
      <LogTimeModal
        entry={editingEntry}
        isOpen={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null);
        }}
      />
      <Modal
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Delete time entry?")}</ModalLayout.Header>
              <ModalLayout.Body>
                <Typography type="body-sm" color="muted">
                  {t(
                    "This removes {task}. You can undo it from the confirmation toast for 20 seconds.",
                    {
                      task: pendingDelete?.task ?? t("this entry"),
                    },
                  )}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary">
                  {t("Cancel")}
                </Button>
                <Button variant="danger" onPress={confirmDelete}>
                  {t("Delete entry")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
