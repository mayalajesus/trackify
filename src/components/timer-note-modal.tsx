import { useState } from "react";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { TextField } from "@heroui/react/textfield";
import { TextArea } from "@heroui/react/textarea";
import { Label } from "@heroui/react/label";
import { ModalLayout } from "./modal-layout";
import { ModalTriggerRegistration } from "./overlay-trigger-registration";
import type { TaskDetails } from "@/lib/domain";
import type { StoreResult } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export function TimerNoteModal({
  taskDetails,
  readOnly = false,
  onSave,
  onClose,
}: {
  taskDetails: TaskDetails;
  readOnly?: boolean;
  onSave: (details: TaskDetails) => StoreResult;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [description, setDescription] = useState(taskDetails.description ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog className="tracker-task-modal tracker-note-modal">
            <Modal.CloseTrigger />
            <ModalLayout.Header>
              {t(taskDetails.description ? "Edit description" : "Add a note")}
            </ModalLayout.Header>
            <ModalLayout.Body>
              <TextField value={description} onChange={setDescription} isReadOnly={readOnly}>
                <Label>{t("Notes")}</Label>
                <TextArea
                  autoFocus
                  rows={3}
                  maxLength={10000}
                  variant="secondary"
                  className="resize-none"
                />
              </TextField>
              {failure ? (
                <p role="alert" className="text-sm text-danger">
                  {t(failure)}
                </p>
              ) : null}
            </ModalLayout.Body>
            <ModalLayout.Footer>
              <Button variant="secondary" onPress={onClose}>
                {t("Cancel")}
              </Button>
              <Button
                isDisabled={readOnly}
                onPress={() => {
                  const result = onSave({
                    ...taskDetails,
                    description,
                  });
                  if (result.success) onClose();
                  else setFailure(result.error);
                }}
              >
                {t("Save")}
              </Button>
            </ModalLayout.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
