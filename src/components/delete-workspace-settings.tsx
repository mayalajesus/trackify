import { useState } from "react";
import { Card } from "@heroui/react/card";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextField } from "@heroui/react/textfield";
import { Modal } from "@heroui/react/modal";
import { Typography } from "@heroui/react/typography";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { FormAlert } from "./form-feedback";
import { ModalLayout } from "./modal-layout";
import { ModalTriggerRegistration } from "./overlay-trigger-registration";

export function DeleteWorkspaceSettings() {
  const { currentWorkspace, currentMember, deleteWorkspace } = useStore();
  const { t, error } = useI18n();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (
    !currentWorkspace ||
    currentWorkspace.ownerId !== currentMember?.id ||
    currentMember?.role !== "Owner"
  )
    return null;
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await deleteWorkspace(currentWorkspace.id, confirmation);
      if (!result.success) {
        setFailure(result.error);
        return;
      }
      setOpen(false);
      toast.success(t("Workspace deleted."));
    } catch {
      setFailure("Could not delete the workspace. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <Typography type="h2" weight="semibold">
          {t("Delete workspace")}
        </Typography>
        <Typography type="body-sm" color="muted">
          {currentWorkspace.name} —{" "}
          {t(
            "Permanently delete this workspace and its projects, clients and time entries for all members. User accounts and other workspaces will be kept.",
          )}
        </Typography>
      </div>
      <Button
        variant="danger"
        className="w-fit"
        onPress={() => {
          setConfirmation("");
          setFailure(null);
          setOpen(true);
        }}
      >
        {t("Delete workspace")}
      </Button>
      <Modal
        isOpen={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog className="settings-delete-modal">
              <Modal.CloseTrigger isDisabled={busy} />
              <ModalLayout.Header>{t("Delete workspace?")}</ModalLayout.Header>
              <ModalLayout.Body>
                <Typography type="body-sm" color="muted">
                  {t(
                    "This permanently deletes projects, clients, invitations and time entries for everyone in this workspace. This action cannot be undone.",
                  )}
                </Typography>
                {failure ? (
                  <FormAlert title={t("Could not delete workspace")} description={error(failure)} />
                ) : null}
                <TextField value={confirmation} onChange={setConfirmation} isDisabled={busy}>
                  <Label>
                    {t("To confirm, type the workspace name:")} {currentWorkspace.name}
                  </Label>
                  <Input variant="secondary" autoComplete="off" />
                </TextField>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button variant="secondary" isDisabled={busy} onPress={() => setOpen(false)}>
                  {t("Cancel")}
                </Button>
                <Button
                  variant="danger"
                  isPending={busy}
                  isDisabled={busy || confirmation !== currentWorkspace.name}
                  onPress={() => void remove()}
                >
                  {t("Delete workspace")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </Card>
  );
}
