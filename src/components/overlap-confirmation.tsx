import { AlertDialog } from "@heroui/react/alert-dialog";
import { Button } from "@heroui/react/button";
import { Description } from "@heroui/react/description";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TimeEntry } from "@/lib/domain";
import { AlertDialogTriggerRegistration } from "@/components/overlay-trigger-registration";

export function formatOverlapConflict(entry: TimeEntry, locale: "en-US" | "pt-BR"): string {
  const end =
    entry.endDate && entry.endDate !== entry.date ? `${entry.end} (${entry.endDate})` : entry.end;
  return `${entry.task} · ${entry.date} · ${entry.start}–${end} · ${formatDuration(entry.seconds, locale)}`;
}

export function OverlapConfirmation({
  conflict,
  isOpen,
  onCancel,
  onConfirm,
}: {
  conflict: TimeEntry | null;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { locale, t } = useI18n();

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogTriggerRegistration />
      <AlertDialog.Backdrop>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className="overlap-confirmation">
            <AlertDialog.Header>
              <AlertDialog.Heading>{t("This entry overlaps another.")}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {conflict ? (
                <Description>{formatOverlapConflict(conflict, locale)}</Description>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={onCancel}>
                {t("Cancel")}
              </Button>
              <Button onPress={onConfirm}>{t("Save anyway")}</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
