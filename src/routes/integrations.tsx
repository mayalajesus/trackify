import { Button } from "@heroui/react/button";
import { Table } from "@heroui/react/table";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { request } from "@/lib/api-data-source";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrações — Trackify" }] }),
  component: IntegrationsPage,
});

function TrelloLogo() {
  return (
    <svg aria-hidden="true" className="size-8 shrink-0" fill="none" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#0C66E4" />
      <rect x="7" y="6" width="6" height="20" rx="1.5" fill="white" />
      <rect x="19" y="6" width="6" height="15" rx="1.5" fill="white" />
    </svg>
  );
}

type Connection = { sessions: number };
async function connectionRequest(operation: string): Promise<Connection> {
  const result = await request<Connection>(operation);
  if (!result.success) throw new Error(result.error);
  if (!Number.isInteger(result.data.sessions) || result.data.sessions < 0)
    throw new Error("Não foi possível verificar a conexão da extensão.");
  return result.data;
}

function IntegrationsPage() {
  const { t } = useI18n();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["extension-connections", session?.user.id];
  const disconnect = useMutation({
    mutationFn: () => connectionRequest("disconnectOwnExtensions"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const connections = useQuery({
    queryKey,
    queryFn: () => connectionRequest("getOwnExtensionConnections"),
    enabled: Boolean(session) && !disconnect.isPending,
    refetchInterval: 10000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });
  const connected = (connections.data?.sessions ?? 0) > 0;
  const unknown = connections.isError || connections.isPending;
  const error = disconnect.error ?? connections.error;
  return (
    <div className="integrations-page">
      <PageHeader
        title={t("Integrations")}
        description="Gerencie a conexão da extensão com sua conta."
      />
      {error && (
        <Typography type="body-sm" role="alert">
          {error.message}
        </Typography>
      )}
      <DataTable className="integrations-table" label={t("Integrations")} minWidth="min-w-[600px]">
        <Table.Header>
          <Table.Column isRowHeader>{t("Integrations")}</Table.Column>
          <Table.Column>{t("Account")}</Table.Column>
          <Table.Column>{t("Status")}</Table.Column>
          <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>
              <div className="flex items-center gap-3">
                <TrelloLogo />
                <div className="min-w-0">
                  <Typography type="body-sm">Trello</Typography>
                  <Typography type="body-xs" color="muted">
                    Extensão Trackify
                  </Typography>
                </div>
              </div>
            </Table.Cell>
            <Table.Cell>{session?.user.email ?? "—"}</Table.Cell>
            <Table.Cell>
              <span className="integration-status" role="status">
                {connections.isPending
                  ? "Verificando…"
                  : connections.isError
                    ? "Indisponível"
                    : connected
                      ? "Conectada"
                      : "Desconectada"}
              </span>
            </Table.Cell>
            <Table.Cell>
              {connected && (
                <Button
                  variant="secondary"
                  size="sm"
                  isPending={disconnect.isPending}
                  onPress={() => disconnect.mutate()}
                >
                  Desconectar
                </Button>
              )}
              {connections.isError && !connected && (
                <Button
                  variant="secondary"
                  size="sm"
                  isPending={connections.isFetching}
                  onPress={() => void connections.refetch()}
                >
                  Tentar novamente
                </Button>
              )}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </DataTable>
      {!unknown && !connected && (
        <Typography type="body-sm" color="muted">
          Para conectar, abra a extensão Trackify no navegador e selecione “Conectar ao Trackify”.
        </Typography>
      )}
      {!unknown && connected && (
        <Typography type="body-sm" color="muted">
          {connections.data!.sessions > 1
            ? `${connections.data!.sessions} conexões ativas. Desconectar encerra todas as conexões da extensão nesta conta.`
            : ""}{" "}
          Desconectar não encerra o cronômetro nem apaga registros de horas.
        </Typography>
      )}
    </div>
  );
}
