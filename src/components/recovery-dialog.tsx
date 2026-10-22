import { useState } from "react";
import { Alert } from "@heroui/react/alert";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { Typography } from "@heroui/react/typography";
import { ModalLayout } from "./modal-layout";
import { ModalTriggerRegistration } from "./overlay-trigger-registration";
import { useStore } from "@/lib/store";
import { canRecoverTimer, planRecovery, type RecoveryDraft } from "@/lib/store/recovery-journal";

function download(draft: RecoveryDraft) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `trackify-rascunho-${draft.updatedAt.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function valueLabel(value: unknown) {
  if (value === undefined) return "Excluído";
  if (value === null) return "Não informado";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function conflictLabel(draft: RecoveryDraft, path: string) {
  const parts = path.split(".");
  const workspace =
    draft.account.workspaces.find((data) => data.workspace.id === parts[1]) ??
    draft.baseline.workspaces.find((data) => data.workspace.id === parts[1]);
  const record =
    workspace?.clients.find((item) => item.id === parts[3]) ??
    workspace?.projects.find((item) => item.id === parts[3]);
  const entry = workspace?.entries.find((item) => item.id === parts[3]);
  const fields: Record<string, string> = {
    name: "Nome",
    task: "Tarefa",
    description: "Observação",
    start: "Início",
    end: "Fim",
    seconds: "Duração",
    date: "Data",
    projectId: "Projeto",
    clientId: "Cliente",
    billable: "Faturável",
    color: "Cor",
    contact: "Contato",
    status: "Status",
  };
  return [
    record?.name ?? entry?.task ?? workspace?.workspace.name ?? "Conta",
    fields[parts.at(-1) ?? ""] ?? "Informação alterada",
  ].join(" — ");
}
export function RecoveryDialog() {
  const { recovery, accountPersistenceError } = useStore();
  const [listOpen, setListOpen] = useState(false);
  const pending = recovery.pendingDrafts;
  const drafts = pending;
  const review = recovery.review;
  const plan = review ? planRecovery(review.draft, review.remote, recovery.choices) : null;
  const timerConflict = review && !canRecoverTimer(review.draft, review.remoteTimer);
  return (
    <>
      {(pending.length > 0 || recovery.storageError || recovery.message) && !review ? (
        <Alert status="warning" className="m-4">
          <Alert.Content>
            <Alert.Title>
              {recovery.storageError ??
                recovery.message ??
                "Há alterações não salvas neste navegador"}
            </Alert.Title>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                setListOpen(true);
                void recovery.refresh();
              }}
            >
              Revisar rascunhos
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {accountPersistenceError ? (
        <div className="mx-4 my-2">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={recovery.busy}
            onPress={() => void recovery.begin()}
          >
            Resolver alterações pendentes
          </Button>
        </div>
      ) : null}
      <Modal
        isOpen={listOpen || Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !recovery.busy) {
            setListOpen(false);
            recovery.close();
          }
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Fechar" />
              <ModalLayout.Header>
                {review ? "Revisar alterações" : "Alterações pendentes"}
              </ModalLayout.Header>
              <ModalLayout.Body>
                {recovery.message ? (
                  <Alert status="danger">
                    <Alert.Content>
                      <Alert.Description>{recovery.message}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
                {review && plan ? (
                  <>
                    <Typography type="body-sm">
                      As alterações compatíveis serão combinadas. Escolha a versão de cada conflito.
                      Uma cópia do rascunho original será preservada neste navegador.
                    </Typography>
                    {plan.conflicts.length === 0 ? (
                      <Typography type="body-sm">Nenhum conflito entre os registros.</Typography>
                    ) : null}
                    {plan.conflicts.map((conflict) => (
                      <section
                        key={conflict.path}
                        className="space-y-2 rounded-lg border border-border p-3"
                      >
                        <Typography type="body-sm" className="break-all">
                          {conflictLabel(review.draft, conflict.path)}
                        </Typography>
                        {conflict.blocked ? (
                          <Typography type="body-sm">
                            Este vínculo mudou no servidor e não será restaurado. O conteúdo local
                            ficará na cópia de recuperação.
                          </Typography>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {(["local", "remote"] as const).map((choice) => (
                              <div key={choice} className="min-w-0 space-y-2">
                                <Typography type="body-sm">
                                  {choice === "local" ? "Neste rascunho" : "No servidor"}
                                </Typography>
                                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-sm">
                                  {valueLabel(conflict[choice])}
                                </pre>
                                <Button
                                  size="sm"
                                  variant={
                                    recovery.choices[conflict.path] === choice
                                      ? "primary"
                                      : "secondary"
                                  }
                                  aria-pressed={recovery.choices[conflict.path] === choice}
                                  onPress={() =>
                                    recovery.setChoices((previous) => ({
                                      ...previous,
                                      [conflict.path]: choice,
                                    }))
                                  }
                                >
                                  {choice === "local" ? "Usar rascunho" : "Usar servidor"}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    ))}
                    {review.draft.timerPending ? (
                      <section className="space-y-2">
                        <Typography type="body-sm">
                          {review.draft.timer.status === "idle"
                            ? review.draft.timer.task
                              ? `Tarefa ainda não iniciada: ${review.draft.timer.task}`
                              : "Este rascunho contém o encerramento do cronômetro."
                            : `Cronômetro do rascunho: ${review.draft.timer.task || "Tarefa sem nome"}`}
                        </Typography>
                        {timerConflict ? (
                          <Typography type="body-sm">
                            O cronômetro do servidor é diferente. Ele será preservado; o cronômetro
                            local continuará disponível na cópia de recuperação.
                          </Typography>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-pressed={recovery.keepRemoteTimer}
                          onPress={() => recovery.setKeepRemoteTimer(!recovery.keepRemoteTimer)}
                        >
                          Manter cronômetro do servidor{recovery.keepRemoteTimer ? " ✓" : ""}
                        </Button>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-3">
                    {drafts.length === 0 ? (
                      <Typography type="body-sm">Nenhuma alteração pendente encontrada.</Typography>
                    ) : null}
                    {drafts.map((draft) => (
                      <section
                        key={draft.id}
                        className="space-y-2 rounded-lg border border-border p-3"
                      >
                        <Typography type="body-sm">
                          {new Date(draft.updatedAt).toLocaleString("pt-BR")} — Alterações pendentes
                        </Typography>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            isDisabled={recovery.busy}
                            onPress={() => void recovery.begin(draft)}
                          >
                            Revisar
                          </Button>
                          <Button size="sm" variant="secondary" onPress={() => download(draft)}>
                            Baixar cópia
                          </Button>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button
                  variant="secondary"
                  isDisabled={recovery.busy}
                  onPress={() => {
                    setListOpen(false);
                    recovery.close();
                  }}
                >
                  Cancelar
                </Button>
                {review ? (
                  <Button
                    isPending={recovery.busy}
                    isDisabled={Boolean(
                      (timerConflict && !recovery.keepRemoteTimer) ||
                      plan?.conflicts.some(
                        (conflict) => !conflict.blocked && !recovery.choices[conflict.path],
                      ),
                    )}
                    onPress={() => void recovery.apply()}
                  >
                    Recuperar alterações
                  </Button>
                ) : null}
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
