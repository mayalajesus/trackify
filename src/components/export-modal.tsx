import { Button } from "@heroui/react/button";
import { Description } from "@heroui/react/description";
import { Form } from "@heroui/react/form";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Radio } from "@heroui/react/radio";
import { RadioGroup } from "@heroui/react/radio-group";
import { toast } from "@/lib/toast";
import { ArrowDownToLine } from "@gravity-ui/icons";
import { useState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import {
  exportReport,
  type ReportExportFormat,
  type ReportExportPayload,
} from "@/lib/report-export";
import { useI18n } from "@/lib/i18n";

export function ExportModal({
  isOpen,
  onOpenChange,
  scope,
  payload,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  scope: string;
  payload: ReportExportPayload;
}) {
  const [format, setFormat] = useState<ReportExportFormat>("csv");
  const [hasExported, setHasExported] = useState(false);
  const [exportError, setExportError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const { t, error } = useI18n();

  const close = (open: boolean) => {
    if (!open) {
      setHasExported(false);
      setExportError("");
      setIsExporting(false);
    }
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={close}>
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <ModalLayout.Header>{t("Export {scope}", { scope })}</ModalLayout.Header>
            <Form
              onSubmit={async (event) => {
                event.preventDefault();
                setIsExporting(true);
                try {
                  const result = await exportReport(format, payload);
                  if (!result.success) {
                    setHasExported(false);
                    setExportError(error(result.error));
                    return;
                  }
                  setHasExported(true);
                  setExportError("");
                  toast.success(t("Your export is ready"), {
                    description:
                      format === "pdf"
                        ? t("The PDF report has been downloaded.")
                        : t("The filtered {format} report is downloading.", {
                            format: format.toUpperCase(),
                          }),
                  });
                } finally {
                  setIsExporting(false);
                }
              }}
            >
              <ModalLayout.Body>
                <Description className="text-foreground">
                  {t("Ready to export: {count} records.", { count: payload.rows.length })}
                </Description>
                <RadioGroup
                  value={format}
                  onChange={(next: string) => {
                    setFormat(next as ReportExportFormat);
                    setExportError("");
                  }}
                  orientation="horizontal"
                  variant="secondary"
                  className="grid grid-cols-3 gap-2"
                >
                  <Label className="col-span-full">{t("Format")}</Label>
                  {(["csv", "xlsx", "pdf"] as const).map((item) => (
                    <Radio key={item} value={item} className="min-w-0">
                      <Radio.Content className="w-full justify-center rounded-lg border border-default bg-surface-secondary px-3 py-2 text-foreground">
                        <Radio.Control className="border-muted">
                          <Radio.Indicator />
                        </Radio.Control>
                        {item.toUpperCase()}
                      </Radio.Content>
                    </Radio>
                  ))}
                </RadioGroup>
                {hasExported ? (
                  <FormAlert
                    status="success"
                    title={t("Your export is ready")}
                    description={
                      format === "pdf"
                        ? t(
                            "The PDF report was downloaded with the current filters and workspace branding.",
                          )
                        : t("The file uses the same filtered dataset shown in this report.")
                    }
                  />
                ) : null}
                {exportError ? (
                  <FormAlert
                    status="danger"
                    title={t("We couldn't prepare the export")}
                    description={exportError}
                  />
                ) : null}
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" type="button" variant="secondary">
                  {t("Close")}
                </Button>
                <Button type="submit" isDisabled={isExporting}>
                  <ArrowDownToLine className="size-4" />
                  {t("Export")}
                </Button>
              </ModalLayout.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
