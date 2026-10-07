import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Switch } from "@heroui/react/switch";
import { Table } from "@heroui/react/table";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRotateLeft } from "@gravity-ui/icons";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { formatLocalDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { trelloBoards, trelloCards, trelloLists, trelloWorkspaces } from "@/lib/mock-data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Trackify" },
      {
        name: "description",
        content: "Connect Trackify to Trello and sync cards into tracked tasks.",
      },
      { property: "og:title", content: "Integrations — Trackify" },
      { property: "og:description", content: "Trello sync for your time tracking." },
    ],
  }),
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

function IntegrationsPage() {
  const { trello, can, currentMember, setTrello } = useStore();
  const { locale, t } = useI18n();
  const canManageIntegrations = can("manage-integrations");
  const connected = trello.status === "connected" || trello.status === "synced";
  const toggleSelected = connected || trello.status === "connecting";

  const connect = (on: boolean) => {
    if (!on) {
      setTrello({ status: "disconnected", workspace: null, board: null, lists: [], cards: [] });
      return;
    }
    setTrello({ status: "connecting" });
    setTimeout(() => {
      setTrello({
        status: "connected",
        workspace: trelloWorkspaces[0] ?? null,
        board: trelloBoards["Agency"]?.[0] ?? null,
        lists: trelloLists.slice(0, 2),
        cards: trelloCards.slice(0, 4),
      });
    }, 700);
  };

  const sync = () => {
    setTrello({ status: "syncing" });
    setTimeout(
      () =>
        setTrello({
          status: "synced",
          cards: trelloCards,
          lastSync: formatLocalDateTime(new Date(), locale),
        }),
      900,
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Integrations")}
        description={t("Bring tasks from the tools you already use.")}
      />

      <DataTable label={t("Integrations")} minWidth="min-w-[760px]">
        <Table.Header>
          <Table.Column isRowHeader>{t("Integrations")}</Table.Column>
          <Table.Column>{t("Account")}</Table.Column>
          <Table.Column>{t("Workspace")}</Table.Column>
          <Table.Column>{t("Status")}</Table.Column>
          <Table.Column>{t("last sync")}</Table.Column>
          <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>
              <div className="flex min-w-56 items-center gap-3">
                <TrelloLogo />
                <div className="min-w-0">
                  <Typography type="body-sm" weight="semibold">
                    Trello
                  </Typography>
                </div>
              </div>
            </Table.Cell>
            <Table.Cell className="whitespace-nowrap">
              {connected ? (currentMember?.email ?? "—") : "—"}
            </Table.Cell>
            <Table.Cell className="whitespace-nowrap">{t("Workspace")}</Table.Cell>
            <Table.Cell>
              <Chip color={connected ? "success" : "default"} size="sm" variant="soft">
                {t(trello.status)}
              </Chip>
            </Table.Cell>
            <Table.Cell className="whitespace-nowrap">{trello.lastSync ?? t("never")}</Table.Cell>
            <Table.Cell>
              {canManageIntegrations ? (
                <div className="flex justify-end gap-2">
                  {connected ? (
                    <Button
                      aria-label={t("Sync now")}
                      size="sm"
                      variant="secondary"
                      isPending={trello.status === "syncing"}
                      onPress={sync}
                    >
                      <ArrowRotateLeft className="size-4" />
                      {t("Sync now")}
                    </Button>
                  ) : null}
                  <Switch
                    aria-label={t("Connect Trello")}
                    isSelected={toggleSelected}
                    onChange={connect}
                  >
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch>
                </div>
              ) : null}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </DataTable>

      {connected ? (
        <div className="mt-5 border-t border-divider pt-5">
          <Typography type="body-xs" color="muted">
            {trello.workspace} · {trello.board}
          </Typography>
          <ul className="mt-3 overflow-hidden">
            {trello.cards.map((card) => (
              <li key={card} className="flex items-center justify-between gap-3 px-4 py-3">
                <Typography type="body-sm" weight="medium">
                  {card}
                </Typography>
                <Chip size="sm" variant="soft">
                  {trello.board}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
