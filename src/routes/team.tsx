import { TeamInvitationDialog } from "@/components/team/invitation-dialog";
import { useTeamInvitations } from "@/components/team/use-team-invitations";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { Typography } from "@heroui/react/typography";
import { toast } from "@/lib/toast";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightFromSquare,
  Copy,
  PaperPlane,
  PersonPencil,
  PersonPlus,
  TrashBin,
} from "@gravity-ui/icons";
import { useRef, useState } from "react";
import { ActionDropdown } from "@/components/action-dropdown";
import { DataTable } from "@/components/data-table";
import { useTablePagination } from "@/lib/use-table-pagination";
import { FormAlert } from "@/components/form-feedback";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { PageHeader } from "@/components/page-header";
import { ProfileAvatar } from "@/components/profile-avatar";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Member, Role } from "@/lib/domain";
import { useStore } from "@/lib/store";

type InviteRole = Exclude<Role, "Owner">;

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team — Trackify" },
      { name: "description", content: "Invite teammates, manage roles and track team hours." },
      { property: "og:title", content: "Team — Trackify" },
      { property: "og:description", content: "Invite teammates and see tracked hours by member." },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const {
    members,
    entries,
    can,
    currentMember,
    activeWorkspaceId,
    leaveWorkspace,
    preferencesByUserId,
    deleteMember,
    removeMember,
    restoreMember,
    updateMemberRole,
  } = useStore();
  const { locale, t, error } = useI18n();
  const invitation = useTeamInvitations();
  const {
    openInvite,
    invitationActionId,
    pendingCancel,
    setPendingCancel,
    cancelError,
    setCancelError,
    handleResend,
    confirmCancel,
  } = invitation;
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteRequestRef = useRef(false);
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const orderedMembers = members
    .filter((member) => !member.deletedAt)
    .sort((a, b) => {
      const rank = { invited: 0, active: 1, removed: 2 } as const;
      return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name);
    });

  const secondsFor = (id: string) =>
    entries.filter((entry) => entry.userId === id).reduce((sum, entry) => sum + entry.seconds, 0);
  const memberPage = useTablePagination(orderedMembers, activeWorkspaceId ?? "");

  const handleRestore = (member: Member) => {
    const result = restoreMember(member.id);
    if (!result.success) {
      toast.danger(t("We couldn't restore access"), { description: error(result.error) });
      return;
    }
    toast.success(t("Access restored"), { description: member.email });
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleteRequestRef.current) return;
    deleteRequestRef.current = true;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const result = await deleteMember(pendingDelete.id);
      if (!result.success) {
        setDeleteError(error(result.error));
        return;
      }
      toast.success(t("Team membership deleted"));
      setPendingDelete(null);
    } catch {
      setDeleteError(t("We couldn't delete this team membership"));
    } finally {
      deleteRequestRef.current = false;
      setDeleteBusy(false);
    }
  };

  const confirmRemove = () => {
    if (!pendingRemove) return;
    const result = removeMember(pendingRemove.id);
    if (!result.success) {
      setRemoveError(error(result.error));
      return;
    }
    toast.success(t("Member removed"), {
      description: t("{email} no longer has access to the workspace.", {
        email: pendingRemove.email,
      }),
    });
    setPendingRemove(null);
    setRemoveError(null);
  };

  const confirmLeave = () => {
    const result = leaveWorkspace(activeWorkspaceId);
    if (!result.success) {
      setLeaveError(error(result.error));
      return;
    }
    setLeaveOpen(false);
    setLeaveError(null);
    toast.success(t("You left the team"));
  };

  const manageRole = (member: Member) => {
    const nextRole: InviteRole = member.role === "Admin" ? "Member" : "Admin";
    const result = updateMemberRole(member.id, nextRole);
    if (!result.success) {
      toast.danger(t("We couldn't change that role"), { description: error(result.error) });
      return;
    }
    toast.success(t("Role updated"), { description: `${member.name} · ${t(nextRole)}` });
  };

  return (
    <div className="team-page">
      <PageHeader
        title={t("Team")}
        description={t("Invite teammates, manage roles and tracked hours.")}
        actions={
          can("manage-members") ? (
            <Button onPress={openInvite}>
              <PaperPlane className="size-4" />
              {t("Invite member")}
            </Button>
          ) : null
        }
      />

      <DataTable
        className="team-table"
        label={t("Team members")}
        minWidth="min-w-[680px]"
        pagination={memberPage.pagination}
      >
        <Table.Header>
          <Table.Column isRowHeader>{t("Member")}</Table.Column>
          <Table.Column>{t("Role")}</Table.Column>
          <Table.Column>{t("Status")}</Table.Column>
          {can("view-all-reports") ? <Table.Column>{t("Tracked")}</Table.Column> : null}
          <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
        </Table.Header>
        <Table.Body>
          {memberPage.items.map((member) => {
            const invited = member.status === "invited";
            const removed = member.status === "removed";
            const isCurrentMember = member.id === currentMember?.id;
            const canManageTarget =
              !isCurrentMember &&
              can("manage-members") &&
              (currentMember?.role === "Owner" || member.role === "Member");
            const canChangeRole =
              canManageTarget &&
              (currentMember?.role === "Owner" ||
                (currentMember?.role === "Admin" && member.status === "active"));
            return (
              <Table.Row key={member.id}>
                <Table.Cell>
                  <div className="flex min-w-0 items-center gap-3">
                    <ProfileAvatar
                      member={member}
                      avatarUrl={preferencesByUserId[member.id]?.avatarUrl ?? null}
                      size="sm"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{invited ? member.email : member.name}</span>
                      <span className="team-member-detail truncate">
                        {invited
                          ? t("Invitation pending")
                          : removed
                            ? t("Access removed")
                            : member.email}
                      </span>
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell>{t(member.role)}</Table.Cell>
                <Table.Cell>
                  <Chip
                    color={invited ? "warning" : removed ? "default" : "success"}
                    size="sm"
                    variant="soft"
                  >
                    {invited ? t("Invited") : removed ? t("Removed") : t("Active")}
                  </Chip>
                </Table.Cell>
                {can("view-all-reports") ? (
                  <Table.Cell>
                    {invited ? "—" : formatDuration(secondsFor(member.id), locale)}
                  </Table.Cell>
                ) : null}
                <Table.Cell>
                  {invited && canManageTarget ? (
                    <div className="flex justify-end">
                      <ActionDropdown
                        menuClassName="team-action-menu"
                        ariaLabel={t("Actions for invitation to {email}", {
                          email: member.email,
                        })}
                        items={[
                          ...(canChangeRole
                            ? [
                                {
                                  id: "role",
                                  label:
                                    member.role === "Admin" ? t("Make member") : t("Make admin"),
                                  icon: <PersonPencil className="size-4" />,
                                },
                              ]
                            : []),
                          {
                            id: "resend",
                            label: t("Copy invitation link"),
                            icon: <Copy className="size-4" />,
                          },
                          {
                            id: "cancel",
                            label: t("Cancel invite"),
                            icon: <TrashBin className="size-4" />,
                            tone: "danger",
                          },
                        ]}
                        onAction={(key) => {
                          if (key === "role") manageRole(member);
                          if (key === "resend" && invitationActionId !== member.id) {
                            void handleResend(member);
                          }
                          if (key === "cancel") {
                            setCancelError(null);
                            setPendingCancel(member);
                          }
                        }}
                      />
                    </div>
                  ) : removed && canManageTarget ? (
                    <div className="flex justify-end">
                      <ActionDropdown
                        menuClassName="team-action-menu"
                        ariaLabel={t("Actions for {name}", { name: member.name })}
                        items={[
                          {
                            id: "restore",
                            label: t("Restore access"),
                            icon: <PersonPlus className="size-4" />,
                          },
                          {
                            id: "delete",
                            label: t("Delete team membership"),
                            icon: <TrashBin className="size-4" />,
                            tone: "danger",
                          },
                        ]}
                        onAction={(key) => {
                          if (key === "restore") handleRestore(member);
                          if (key === "delete") {
                            setDeleteError(null);
                            setPendingDelete(member);
                          }
                        }}
                      />
                    </div>
                  ) : member.status === "active" && canManageTarget ? (
                    <div className="flex justify-end">
                      <ActionDropdown
                        menuClassName="team-action-menu"
                        ariaLabel={t("Actions for {name}", { name: member.name })}
                        items={[
                          ...(canChangeRole
                            ? [
                                {
                                  id: "role",
                                  label:
                                    member.role === "Admin" ? t("Make member") : t("Make admin"),
                                  icon: <PersonPencil className="size-4" />,
                                },
                              ]
                            : []),
                          {
                            id: "remove",
                            label: t("Remove from team"),
                            icon: <TrashBin className="size-4" />,
                            tone: "danger",
                          },
                          {
                            id: "delete",
                            label: t("Delete team membership"),
                            icon: <TrashBin className="size-4" />,
                            tone: "danger",
                          },
                        ]}
                        onAction={(key) => {
                          if (key === "role") manageRole(member);
                          if (key === "delete") {
                            setDeleteError(null);
                            setPendingDelete(member);
                          }
                          if (key === "remove") {
                            setRemoveError(null);
                            setPendingRemove(member);
                          }
                        }}
                      />
                    </div>
                  ) : isCurrentMember && member.status === "active" ? (
                    <div className="flex justify-end">
                      <ActionDropdown
                        menuClassName="team-action-menu"
                        ariaLabel={t("Actions for {name}", { name: member.name })}
                        items={[
                          {
                            id: "leave",
                            label: t("Leave team"),
                            icon: <ArrowRightFromSquare className="size-4" />,
                            tone: "danger",
                          },
                        ]}
                        onAction={(key) => {
                          if (key === "leave") {
                            setLeaveError(null);
                            setLeaveOpen(true);
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </DataTable>

      <Modal
        isOpen={leaveOpen}
        onOpenChange={(open) => {
          setLeaveOpen(open);
          if (!open) setLeaveError(null);
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog className="team-modal">
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Leave team?")}</ModalLayout.Header>
              <ModalLayout.Body>
                {leaveError ? (
                  <FormAlert title={t("We couldn't leave this team")} description={leaveError} />
                ) : null}
                <Typography type="body-sm" color="muted">
                  {currentMember?.role === "Owner"
                    ? t(
                        "The team owner cannot leave. You can archive the workspace from the Workspaces page.",
                      )
                    : t(
                        "You will lose access to this workspace. Your tracked history stays intact.",
                      )}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary">
                  {t("Cancel")}
                </Button>
                <Button
                  variant="danger"
                  isDisabled={currentMember?.role === "Owner"}
                  onPress={confirmLeave}
                >
                  {t("Leave team")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <TeamInvitationDialog invitation={invitation} />

      <Modal
        isOpen={pendingCancel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCancel(null);
            setCancelError(null);
          }
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog className="team-modal">
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Cancel invitation?")}</ModalLayout.Header>
              <ModalLayout.Body>
                {cancelError ? (
                  <FormAlert
                    title={t("We couldn't cancel this invitation")}
                    description={cancelError}
                  />
                ) : null}
                <Typography type="body-sm" color="muted">
                  {t("The pending invitation for {email} will be removed from the team list.", {
                    email: pendingCancel?.email ?? t("this member"),
                  })}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary">
                  {t("Keep invitation")}
                </Button>
                <Button
                  variant="danger"
                  isPending={invitationActionId === pendingCancel?.id}
                  onPress={() => void confirmCancel()}
                >
                  {t("Cancel invitation")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteRequestRef.current) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog className="team-modal team-delete-membership-modal">
              <Modal.CloseTrigger isDisabled={deleteBusy} />
              <ModalLayout.Header>{t("Permanently delete team membership?")}</ModalLayout.Header>
              <ModalLayout.Body>
                {deleteError ? (
                  <FormAlert
                    title={t("We couldn't delete this team membership")}
                    description={deleteError}
                  />
                ) : null}
                <Typography type="body-sm" color="muted">
                  {t(
                    "{name} will leave this team and lose workspace access. Their time entries and history will remain available. This membership cannot be restored; joining again requires accepting a new invitation.",
                    { name: pendingDelete?.name ?? t("this member") },
                  )}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary" isDisabled={deleteBusy}>
                  {t("Cancel")}
                </Button>
                <Button
                  variant="danger"
                  isDisabled={deleteBusy}
                  onPress={() => void confirmDelete()}
                >
                  {t("Delete team membership")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal
        isOpen={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
            setRemoveError(null);
          }
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog className="team-modal">
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Remove member from team?")}</ModalLayout.Header>
              <ModalLayout.Body>
                {removeError ? (
                  <FormAlert
                    title={t("We couldn't remove this member")}
                    description={removeError}
                  />
                ) : null}
                <Typography type="body-sm" color="muted">
                  {t(
                    "Removing {name} revokes workspace access and removes them from current project assignments. Their tracked time and reports remain available. Restoring access later will not reassign projects automatically.",
                    {
                      name: pendingRemove?.name ?? t("this member"),
                    },
                  )}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary">
                  {t("Keep member")}
                </Button>
                <Button variant="danger" onPress={confirmRemove}>
                  {t("Remove from team")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
