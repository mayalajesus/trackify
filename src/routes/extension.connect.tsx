import { Button } from "@heroui/react/button";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CircleCheck, ShieldCheck } from "@gravity-ui/icons";
import { AuthPage } from "@/components/auth-page";
import { useAuth } from "@/lib/auth-context";
import { getAuthClient } from "@/lib/auth-client";
import { getLoginPath } from "@/lib/auth-redirect";
import { parseExtensionConnectRequest, sendExtensionSession } from "@/lib/extension-connect";

export const Route = createFileRoute("/extension/connect")({ component: ExtensionConnectPage });

function ExtensionConnectPage() {
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const request = parseExtensionConnectRequest(
    window.location.search,
    import.meta.env["VITE_TRACKIFY_EXTENSION_IDS"] ?? "",
  );

  const connect = async () => {
    if (!request || !session || busy) return;
    setBusy(true);
    setError("");
    try {
      const auth = await getAuthClient();
      const current = await auth?.getSession();
      if (current?.error || !current?.data.session) throw new Error("Session unavailable");
      const token = (await auth?.getJWTToken?.()) || current.data.session.access_token;
      if (!token) throw new Error("Token unavailable");
      const expiresAt = Math.min(
        Date.now() + 15 * 60_000,
        (current.data.session.expires_at ?? 0) * 1000,
      );
      if (expiresAt <= Date.now() + 30_000) throw new Error("Session expired");
      await sendExtensionSession(request.extensionId, {
        type: "TRACKIFY_CONNECT",
        version: 1,
        state: request.state,
        token,
        expiresAt,
      });
      setDone(true);
    } catch {
      setError("Não foi possível conectar. Reabra a conexão pela extensão e tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPage
      variant="extension"
      title={done ? "Extensão conectada" : "Conectar extensão"}
      description={
        done
          ? "Tudo pronto para registrar seu tempo no Trello."
          : "Registre o tempo dos seus cartões do Trello no Trackify."
      }
    >
      {!request ? (
        <Typography type="body-sm">
          Esta conexão não está habilitada ou o link é inválido. Abra a conexão pelo ícone da
          extensão Trackify.
        </Typography>
      ) : loading ? (
        <Typography type="body-sm">Verificando sua conta…</Typography>
      ) : !session ? (
        <Button className="w-full" onPress={() => window.location.assign(getLoginPath())}>
          Entrar no Trackify
        </Button>
      ) : done ? (
        <div className="extension-connect-content">
          <div className="extension-connect-status" role="status">
            <CircleCheck aria-hidden="true" width={24} height={24} />
            <Typography type="body-sm">
              Abra o Trackify no menu de extensões do navegador ou volte ao seu cartão do Trello
              para começar. Você já pode fechar esta aba.
            </Typography>
          </div>
          <Button className="w-full" onPress={() => window.location.assign("/tracker")}>
            Ir para o Trackify
          </Button>
        </div>
      ) : (
        <div className="extension-connect-content">
          <div className="extension-connect-account">
            <span>Conectar com esta conta</span>
            <strong>{session.user.email}</strong>
          </div>
          <div className="extension-connect-status">
            <ShieldCheck aria-hidden="true" width={24} height={24} />
            <Typography type="body-sm">
              A extensão poderá controlar o cronômetro e consultar seus projetos. Sua senha não será
              compartilhada.
            </Typography>
          </div>
          <Typography type="body-sm" color="muted" className="extension-connect-hint">
            A conexão é renovada automaticamente, mesmo ao fechar o navegador. Você pode desconectar
            quando quiser pelo painel da extensão.
          </Typography>
          {error && (
            <Typography type="body-sm" role="alert" className="extension-connect-error">
              {error}
            </Typography>
          )}
          <div className="extension-connect-actions">
            <Button
              variant="secondary"
              isDisabled={busy}
              onPress={() => window.location.assign("/tracker")}
            >
              Cancelar
            </Button>
            <Button isDisabled={busy} onPress={() => void connect()}>
              {busy ? "Conectando…" : "Autorizar conexão"}
            </Button>
          </div>
        </div>
      )}
    </AuthPage>
  );
}
