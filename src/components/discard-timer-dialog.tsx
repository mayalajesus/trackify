import { useState } from "react";
import { AlertDialog } from "@heroui/react/alert-dialog";
import { Button } from "@heroui/react/button";
import { AlertDialogTriggerRegistration } from "./overlay-trigger-registration";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export function DiscardTimerDialog({
  onCancel,
  onDiscard,
}: {
  onCancel: () => void;
  onDiscard: () => void;
}) {
  const { timer, discardTimer } = useStore();
  const { t, error } = useI18n();
  const [expected] = useState(timer);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogTriggerRegistration />
      <AlertDialog.Backdrop>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className="trackify-alert-dialog">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t("Discard this task?")}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {t("Elapsed time will be discarded for everyone tracking this task.")}
              {failure && (
                <p role="alert" className="text-danger">
                  {error(failure)}
                </p>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" isDisabled={busy} onPress={onCancel}>
                {t("Cancel")}
              </Button>
              <Button
                variant="danger"
                isPending={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    const result = await discardTimer(expected);
                    if (result.success) onDiscard();
                    else setFailure(result.error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Discard task")}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
