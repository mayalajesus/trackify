import { Button } from "@heroui/react/button";
import { Link } from "@heroui/react/link";
import { Modal } from "@heroui/react/modal";
import { SearchField } from "@heroui/react/search-field";
import { ListBox } from "@heroui/react/list-box";
import { Label } from "@heroui/react/label";
import { Tag } from "@heroui/react/tag";
import { TagGroup } from "@heroui/react/tag-group";
import { Separator } from "@heroui/react/separator";
import { Check, Plus, LayoutColumns } from "@gravity-ui/icons";
import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react/toast";
import { ProfileAvatar } from "./profile-avatar";
import { ModalLayout } from "./modal-layout";
import { ModalSelect } from "./modal-select";
import { ModalTriggerRegistration } from "./overlay-trigger-registration";
import { FormAlert } from "./form-feedback";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { request } from "@/lib/api-data-source";
import type { TaskDetails } from "@/lib/domain";
import {
  authorizeTrello,
  trelloRequest,
  resetTrelloSession,
  trelloConfigured,
  type TrelloBoard,
  type TrelloCard,
} from "@/lib/trello-client";

export function TrackerTaskModal({
  mode,
  onClose,
  task,
  projectId,
  details,
  onDetailsChange,
  onBeforeInvite,
}: {
  mode: "members" | "trello" | null;
  onClose: () => void;
  task: string;
  projectId: string | null;
  details: TaskDetails;
  onDetailsChange: (details: TaskDetails) => void | boolean;
  onBeforeInvite?: () => boolean;
}) {
  const { members, currentUserId, activeWorkspaceId, projects, preferencesByUserId } = useStore();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [board, setBoard] = useState("");
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [cardId, setCardId] = useState("");
  useEffect(() => {
    resetTrelloSession(currentUserId);
    setBoards([]);
    setCards([]);
    setBoard("");
  }, [currentUserId]);
  useEffect(() => {
    setQuery("");
    setFailure(null);
    setSelected([]);
    setCardId(details.trelloCard?.id ?? "");
  }, [mode, activeWorkspaceId, details.id, details.trelloCard?.id]);
  useEffect(() => {
    if (!board || mode !== "trello") return;
    let cancelled = false;
    setBusy(true);
    setCards([]);
    setCardId("");
    setFailure(null);
    trelloRequest<TrelloCard[]>(
      `boards/${encodeURIComponent(board)}/cards/open?fields=name,shortUrl,idList`,
    )
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch((error) => {
        if (!cancelled) setFailure(t(error.message));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [board, mode, t]);
  const project = projects.find((p) => p.id === projectId);
  const available = members.filter(
    (m) =>
      m.status === "active" &&
      m.id !== currentUserId &&
      (m.role !== "Member" || project?.memberIds.includes(m.id)),
  );
  const filtered = available.filter((m) =>
    `${m.name} ${m.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const connect = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await authorizeTrello();
      const data = await trelloRequest<TrelloBoard[]>("members/me/boards?filter=open&fields=name");
      setBoards(data);
      setBoard(data[0]?.id ?? "");
    } catch (error) {
      setFailure(t(error instanceof Error ? error.message : "Could not load Trello data."));
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (mode === "trello") {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      const saved = onDetailsChange({
        ...details,
        trelloCard: {
          id: card.id,
          name: card.name,
          url: card.shortUrl,
          board: boards.find((b) => b.id === board)?.name ?? "",
        },
      });
      if (saved !== false) onClose();
      return;
    }
    setBusy(true);
    setFailure(null);
    if (onBeforeInvite && !onBeforeInvite()) {
      setBusy(false);
      return;
    }
    const result = await request<null>("inviteToTask", {
      workspaceId: activeWorkspaceId,
      task,
      projectId,
      taskDetails: details,
      memberIds: selected,
    });
    setBusy(false);
    if (!result.success) {
      setFailure(t(result.error));
      return;
    }
    toast.success(t("Task invitations sent"));
    onClose();
  };
  return (
    <Modal
      isOpen={mode !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog className={`tracker-task-modal tracker-task-modal--${mode}`}>
            <Modal.CloseTrigger isDisabled={busy} />
            <ModalLayout.Header>
              {mode === "trello" ? (
                <LayoutColumns aria-hidden="true" className="size-5 text-[#0052CC]" />
              ) : null}
              {t(mode === "members" ? "Add members" : "Link to Trello")}
            </ModalLayout.Header>
            <ModalLayout.Body className="gap-4">
              <p className="text-sm text-muted">
                {t(
                  mode === "members"
                    ? "Select who participates in the same task."
                    : "Select a card to link to the task.",
                )}
              </p>
              {failure ? (
                <FormAlert title={t("Unable to complete this action")} description={failure} />
              ) : null}
              {mode === "trello" && details.trelloCard ? (
                <div className="flex items-center gap-2 text-sm">
                  <Link
                    className="min-w-0 flex-1 truncate text-accent underline"
                    href={details.trelloCard.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {details.trelloCard.name}
                  </Link>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onPress={() => {
                      const saved = onDetailsChange({ ...details, trelloCard: null });
                      if (saved !== false) onClose();
                    }}
                  >
                    {t("Unlink card")}
                  </Button>
                </div>
              ) : null}
              {mode === "trello" && boards.length === 0 ? (
                <>
                  <p className="text-sm text-muted">
                    {t(
                      trelloConfigured
                        ? "Connect Trello to select a card."
                        : "Trello is not configured yet.",
                    )}
                  </p>
                  <Button
                    isDisabled={!trelloConfigured}
                    isPending={busy}
                    onPress={() => void connect()}
                  >
                    {t("Connect Trello")}
                  </Button>
                </>
              ) : (
                <>
                  {mode === "trello" ? (
                    <ModalSelect
                      label={t("Board")}
                      buttonAriaLabel={t("Board")}
                      value={board}
                      options={boards.map((b) => ({ id: b.id, label: b.name }))}
                      onChange={setBoard}
                    />
                  ) : null}
                  <SearchField
                    aria-label={t(mode === "members" ? "Search by name or email" : "Search cards")}
                    value={query}
                    onChange={setQuery}
                    variant="secondary"
                  >
                    <SearchField.Group>
                      <SearchField.SearchIcon />
                      <SearchField.Input
                        placeholder={t(
                          mode === "members" ? "Search by name or email" : "Search cards",
                        )}
                      />
                      <SearchField.ClearButton />
                    </SearchField.Group>
                  </SearchField>
                  {mode === "members" ? (
                    <>
                      <TagGroup
                        className="project-members"
                        aria-label={t("Selected members")}
                        onRemove={(keys) => setSelected((ids) => ids.filter((id) => !keys.has(id)))}
                      >
                        <Label>
                          {t("Selected members")} · {selected.length}
                        </Label>
                        <TagGroup.List items={available.filter((m) => selected.includes(m.id))}>
                          {(m) => (
                            <Tag id={m.id} textValue={m.name}>
                              <ProfileAvatar
                                member={m}
                                size="sm"
                                avatarUrl={preferencesByUserId[m.id]?.avatarUrl ?? null}
                              />
                              {m.name}
                              <Tag.RemoveButton />
                            </Tag>
                          )}
                        </TagGroup.List>
                      </TagGroup>
                      <Separator />
                      <Label>{t("Team members")}</Label>
                      <ListBox
                        aria-label={t("Team members")}
                        selectionMode="multiple"
                        selectedKeys={new Set(selected)}
                        onSelectionChange={(keys) =>
                          setSelected(
                            keys === "all" ? available.map((m) => m.id) : Array.from(keys, String),
                          )
                        }
                        className="max-h-64 overflow-y-auto"
                        renderEmptyState={() => (
                          <p className="p-2 text-sm text-muted">
                            {t("No available members for this project")}
                          </p>
                        )}
                      >
                        {filtered.map((m) => (
                          <ListBox.Item
                            id={m.id}
                            key={m.id}
                            textValue={`${m.name} ${m.email}`}
                            className="rounded-xl data-[selected=true]:bg-accent-soft"
                          >
                            <ProfileAvatar
                              member={m}
                              size="sm"
                              avatarUrl={preferencesByUserId[m.id]?.avatarUrl ?? null}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{m.name}</p>
                              <p className="truncate text-xs text-muted">{m.email}</p>
                            </div>
                            {selected.includes(m.id) ? (
                              <Check className="size-4 text-accent" />
                            ) : (
                              <Plus className="size-4" />
                            )}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </>
                  ) : (
                    <>
                      <Label>{t("Board cards")}</Label>
                      <ListBox
                        aria-label={t("Board cards")}
                        selectionMode="single"
                        selectedKeys={new Set(cardId ? [cardId] : [])}
                        onSelectionChange={(keys) => {
                          if (keys !== "all") setCardId(String(Array.from(keys)[0] ?? ""));
                        }}
                        className="max-h-64 overflow-y-auto"
                        renderEmptyState={() => (
                          <p className="p-2 text-sm text-muted">
                            {t(busy ? "Loading cards…" : "No cards found")}
                          </p>
                        )}
                      >
                        {cards
                          .filter((c) =>
                            c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                          )
                          .map((c) => (
                            <ListBox.Item
                              key={c.id}
                              id={c.id}
                              textValue={c.name}
                              className="rounded-xl data-[selected=true]:bg-accent-soft"
                            >
                              <div className="min-w-0 flex-1">
                                <p>{c.name}</p>
                                <p className="text-xs text-muted">
                                  {boards.find((b) => b.id === board)?.name}
                                </p>
                              </div>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                      </ListBox>
                    </>
                  )}
                </>
              )}
            </ModalLayout.Body>
            <ModalLayout.Footer className="tracker-task-footer">
              <Button
                isPending={busy}
                isDisabled={
                  mode === "members" ? selected.length === 0 || !task.trim() || !projectId : !cardId
                }
                onPress={() => void submit()}
              >
                {t(mode === "members" ? "Invite selected members" : "Link selected card")}
              </Button>
            </ModalLayout.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function TaskInvitationInbox() {
  const { activeWorkspaceId, currentUserId, timer, acceptTaskInvitation } = useStore();
  const inboxRevision = useRef(0);
  const { t } = useI18n();
  const [invitations, setInvitations] = useState<
    Array<{
      id: string;
      task: string;
      projectId: string;
      taskDetails: TaskDetails;
      senderName: string;
    }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setInvitations([]);
    setFailure(null);
    const load = async () => {
      const revision = inboxRevision.current;
      const result = await request<typeof invitations>("listTaskInvitations", {
        workspaceId: activeWorkspaceId,
      });
      if (!cancelled && revision === inboxRevision.current && result.success)
        setInvitations(result.data);
    };
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeWorkspaceId, currentUserId]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    if (timer.status === "idle") setDismissed([]);
  }, [timer.status, activeWorkspaceId]);
  const invitation = invitations.find((item) => !dismissed.includes(item.id));
  const respond = async (response: "accepted" | "declined") => {
    if (!invitation || busy) return;
    inboxRevision.current += 1;
    setBusy(true);
    setFailure(null);
    const result =
      response === "accepted"
        ? await acceptTaskInvitation(invitation.id)
        : await request<null>("respondTaskInvitation", {
            workspaceId: activeWorkspaceId,
            invitationId: invitation.id,
            response,
          });
    setBusy(false);
    if (!result.success) {
      setFailure(t(result.error));
      return;
    }
    if (response === "accepted") toast.success(t("Collaboration started"));
    setInvitations((current) => current.filter((i) => i.id !== invitation.id));
  };
  return (
    <Modal isOpen={Boolean(invitation)}>
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog className="tracker-invitation-modal">
            <Modal.CloseTrigger
              isDisabled={busy}
              onPress={() => {
                if (invitation) setDismissed((items) => [...items, invitation.id]);
              }}
            />
            <ModalLayout.Header>{t("Task invitation")}</ModalLayout.Header>
            <ModalLayout.Body>
              {failure ? (
                <FormAlert title={t("Unable to complete this action")} description={failure} />
              ) : null}
              <p className="text-sm">
                <span className="text-accent">{invitation?.senderName}</span>{" "}
                {t("invited you to the task")}{" "}
                <span className="text-accent">{invitation?.task}</span>.
              </p>
              {timer.status !== "idle" ? (
                <p className="text-sm text-muted">
                  {t("Stop the active timer before accepting a task invitation.")}
                </p>
              ) : null}
            </ModalLayout.Body>
            <ModalLayout.Footer>
              <Button
                variant="secondary"
                isDisabled={busy}
                onPress={() => void respond("declined")}
              >
                {t("Decline")}
              </Button>
              {timer.status !== "idle" ? (
                <Button
                  variant="tertiary"
                  isDisabled={busy}
                  onPress={() => {
                    if (invitation) setDismissed((items) => [...items, invitation.id]);
                  }}
                >
                  {t("Later")}
                </Button>
              ) : null}
              <Button
                isDisabled={timer.status !== "idle"}
                isPending={busy}
                onPress={() => void respond("accepted")}
              >
                {t("Accept invitation")}
              </Button>
            </ModalLayout.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
