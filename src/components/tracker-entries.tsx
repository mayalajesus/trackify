import { DataTable } from "@/components/data-table";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import type { TimeEntry } from "@/lib/domain";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { toast } from "@heroui/react/toast";
import { Typography } from "@heroui/react/typography";
import { useEffect, useMemo, useState } from "react";
import { TrackerEntryRow } from "./tracker-entries/entry-row";
import { TrackerGroupSummaryRow } from "./tracker-entries/group-summary-row";
import { groupEntries, trackerEntryRowKey } from "./tracker-entries/grouping";
import type { ActiveCell, TrackerDay } from "./tracker-entries/types";
import { TaskParticipantsProvider } from "./tracker-task-team";

export type { TrackerDay } from "./tracker-entries/types";

export { groupEntries } from "./tracker-entries/grouping";

export { trackerEntryRowKey } from "./tracker-entries/grouping";

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
        minWidth="min-w-[1080px] lg:min-w-[960px]"
        contentClassName="table-fixed"
        selectedKeys={selectedRowKeys}
      >
        <Table.Header>
          <Table.Column isRowHeader className="whitespace-nowrap">
            {t("Task")}
          </Table.Column>
          <Table.Column className="w-[240px] whitespace-nowrap">
            {t("Project / client")}
          </Table.Column>
          <Table.Column className="w-[76px] whitespace-nowrap text-center">
            {t("Start column")}
          </Table.Column>
          <Table.Column className="w-[76px] whitespace-nowrap text-center">{t("End")}</Table.Column>
          <Table.Column className="w-[100px] whitespace-nowrap text-center">
            {t("Date")}
          </Table.Column>
          <Table.Column className="w-[96px] whitespace-nowrap text-center">
            {t("Duration")}
          </Table.Column>
          <Table.Column className="w-[112px] text-center">{t("Team")}</Table.Column>
          <Table.Column className="w-[60px]" aria-label={t("Actions")} />
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
            <Modal.Dialog className="tracker-delete-modal">
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
