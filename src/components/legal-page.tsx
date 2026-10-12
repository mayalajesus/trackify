import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Typography } from "@heroui/react/typography";
import type { ReactNode } from "react";
import { RouterLink } from "./router-link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-legal-page">
      <article className="auth-card auth-legal-card">
        <div className="auth-legal-header">
          <div>
            <Typography type="h1" className="auth-title">
              {title}
            </Typography>
            <Typography type="body-sm" color="muted" className="mt-1">
              Última atualização: {updated}
            </Typography>
          </div>
          <Button
            className="auth-outline"
            variant="secondary"
            onPress={() => window.history.back()}
          >
            Voltar
          </Button>
        </div>
        <Card className="auth-legal-document">{children}</Card>
        <Typography type="body-xs" color="muted" align="center" className="auth-legal-links">
          <RouterLink to="/terms">Termos de Uso</RouterLink>
          {" · "}
          <RouterLink to="/privacy">Aviso de Privacidade</RouterLink>
          {" · "}
          <RouterLink to="/login">Entrar</RouterLink>
        </Typography>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="auth-legal-section">
      <Typography type="h2" weight="semibold">
        {title}
      </Typography>
      <div className="auth-legal-copy">{children}</div>
    </section>
  );
}
