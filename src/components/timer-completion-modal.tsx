import { useState } from "react";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { TextField } from "@heroui/react/textfield";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ModalLayout } from "./modal-layout";
import { ModalTriggerRegistration } from "./overlay-trigger-registration";
import { ProjectSelect } from "./project-select";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export function TimerCompletionModal({ onClose }: { onClose: () => void }) {
  const { timer, updateTimer, stopTimer } = useStore();
  const { t, error } = useI18n();
  const [task, setTask] = useState(timer.task);
  const [projectId, setProjectId] = useState(timer.projectId);
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
          <Modal.Dialog className="tracker-task-modal tracker-completion-modal">
            <Modal.CloseTrigger />
            <ModalLayout.Header>{t("Complete time entry")}</ModalLayout.Header>
            <ModalLayout.Body>
              <p className="text-sm text-muted">
                {t("The timer is paused. Add the task and project to save your time.")}
              </p>
              <TextField
                value={task}
                onChange={(value) => {
                  setTask(value);
                  if (value.trim()) updateTimer({ task: value });
                }}
                isRequired
              >
                <Label>{t("Task")}</Label>
                <Input autoFocus maxLength={240} variant="secondary" />
              </TextField>
              <div>
                <Label>{t("Project")}</Label>
                <ProjectSelect
                  required
                  groupByClient
                  trackerStyle
                  ariaLabel={t("Project")}
                  value={projectId ?? "none"}
                  onChange={(value) => {
                    setProjectId(value);
                    updateTimer({ projectId: value });
                  }}
                />
              </div>
              {failure && (
                <p role="alert" className="text-sm text-danger">
                  {error(failure)}
                </p>
              )}
            </ModalLayout.Body>
            <ModalLayout.Footer>
              <Button variant="secondary" onPress={onClose}>
                {t("Cancel")}
              </Button>
              <Button
                isDisabled={!task.trim() || !projectId}
                onPress={() => {
                  const updated = updateTimer({ task, projectId });
                  if (!updated.success) {
                    setFailure(updated.error);
                    return;
                  }
                  const result = stopTimer();
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
