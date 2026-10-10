import { Button } from "@heroui/react/button";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
      title="Conectar a extensão Trackify"
      description="Use sua conta do Trackify no Chrome."
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
        <Typography type="body-sm" role="status">
          Extensão conectada. Você pode fechar esta aba e abrir o Trackify no menu de extensões.
        </Typography>
      ) : (
        <div className="flex flex-col gap-4">
          <Typography type="body-sm">
            Conectar como {session.user.email}? A extensão receberá uma sessão temporária da sua
            conta. Sua senha não será compartilhada.
          </Typography>
          <Typography type="body-sm" color="muted">
            A conexão expira em até 15 minutos ou ao encerrar o navegador. Você pode desconectar
            pelo painel da extensão.
          </Typography>
          {error && (
            <Typography type="body-sm" role="alert">
              {error}
            </Typography>
          )}
          <Button className="w-full" isDisabled={busy} onPress={() => void connect()}>
            {busy ? "Conectando…" : "Autorizar conexão"}
          </Button>
          <Button
            variant="secondary"
            isDisabled={busy}
            onPress={() => window.location.assign("/tracker")}
          >
            Cancelar
          </Button>
        </div>
      )}
    </AuthPage>
  );
}
