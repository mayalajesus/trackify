import { ChevronRight, FileText, ShieldCheck } from "@gravity-ui/icons";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Checkbox } from "@heroui/react/checkbox";
import { Label } from "@heroui/react/label";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { RouterLink } from "@/components/router-link";
import { useAccountLifecycle } from "@/lib/account-lifecycle-context";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/legal-consent")({ component: LegalConsentPage });

function LegalConsentPage() {
  const { locale } = useI18n();
  const { acceptLegalTerms, status } = useAccountLifecycle();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!accepted) return;
    setBusy(true);
    const result = await acceptLegalTerms(locale);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    window.location.replace(getAuthReturnPath());
  };

  return (
    <main
      data-page="legal-consent"
      className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 sm:py-10"
    >
      <section aria-labelledby="legal-consent-title" className="mx-auto w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-surface text-accent shadow-sm">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
          <Typography id="legal-consent-title" type="h1" weight="semibold" align="center">
            Revise os termos para continuar
          </Typography>
          <Typography type="body-sm" color="muted" align="center" className="mx-auto mt-2 max-w-sm">
            Confirme que você leu os documentos vigentes para continuar no Trackify.
          </Typography>
        </div>

        {error ? (
          <div className="mb-4">
            <FormAlert title="Não foi possível registrar o aceite" description={error} />
          </div>
        ) : null}

        <Card className="space-y-5 p-5 sm:p-6">
          <div>
            <Typography type="body-sm" weight="semibold">
              Documentos vigentes
            </Typography>
            <Typography type="body-xs" color="muted" className="mt-1">
              Abra cada documento para consultar o conteúdo completo.
            </Typography>
          </div>

          <div className="space-y-2">
            <LegalDocumentLink
              to="/terms"
              title="Termos de Uso"
              version={status?.legal.termsVersion}
            />
            <LegalDocumentLink
              to="/privacy"
              title="Aviso de Privacidade"
              version={status?.legal.privacyVersion}
            />
          </div>

          <Checkbox isSelected={accepted} onChange={setAccepted} className="w-full">
            <Checkbox.Content className="w-full items-start gap-3 rounded-xl border border-default bg-surface-secondary p-4">
              <Checkbox.Control className="mt-0.5 shrink-0">
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Label className="cursor-pointer text-sm leading-5 text-foreground">
                Li e concordo com os Termos de Uso e o Aviso de Privacidade.
              </Label>
            </Checkbox.Content>
          </Checkbox>

          <div className="space-y-3">
            <Button
              className="w-full"
              isDisabled={!accepted}
              isPending={busy}
              onPress={() => void submit()}
            >
              Aceitar e continuar
            </Button>
            <Typography type="body-xs" color="muted" align="center">
              Seu aceite será registrado com as versões exibidas acima.
            </Typography>
          </div>
        </Card>
      </section>
    </main>
  );
}

function LegalDocumentLink({
  to,
  title,
  version,
}: {
  to: "/terms" | "/privacy";
  title: string;
  version: string | undefined;
}) {
  return (
    <RouterLink
      to={to}
      className="group flex w-full items-center gap-3 rounded-xl bg-surface-secondary px-3.5 py-3 no-underline transition-colors hover:bg-surface-tertiary"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
        <FileText aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted">Versão {version ?? "—"}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
      />
    </RouterLink>
  );
}
