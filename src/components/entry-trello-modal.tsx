import { useState } from "react";
import { toast } from "@/lib/toast";
import { TrackerTaskModal } from "./tracker-task-modal";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { TimeEntry } from "@/lib/domain";

export function EntryTrelloModal({
  entries,
  onClose,
  mode = "trello",
}: {
  entries: TimeEntry[];
  onClose: () => void;
  mode?: "members" | "trello";
}) {
  const { entries: currentEntries, updateEntry } = useStore();
  const { t, error } = useI18n();
  const [detailsId] = useState(() => crypto.randomUUID());
  const first = currentEntries.find((item) => item.id === entries[0]?.id);
  if (!first) return null;

  return (
    <TrackerTaskModal
      mode={mode}
      onClose={onClose}
      task={first.task}
      projectId={first.projectId}
      details={first.taskDetails ?? { id: detailsId, urgent: false }}
      onBeforeInvite={() => {
        const result = updateEntry(first.id, {
          taskDetails: first.taskDetails ?? { id: detailsId, urgent: false },
        });
        if (!result.success)
          toast.danger(t("Unable to complete this action"), { description: error(result.error) });
        return result.success;
      }}
      onDetailsChange={(details) => {
        for (const target of entries) {
          const entry = currentEntries.find((item) => item.id === target.id);
          if (!entry) continue;
          const result = updateEntry(entry.id, {
            taskDetails: {
              id:
                entry.taskDetails?.id ?? (entry.id === first.id ? detailsId : crypto.randomUUID()),
              urgent: false,
              ...entry.taskDetails,
              trelloCard: details.trelloCard ?? null,
            },
          });
          if (!result.success) {
            toast.danger(t("Unable to save Trello link"), { description: error(result.error) });
            return false;
          }
        }
        return true;
      }}
    />
  );
}
