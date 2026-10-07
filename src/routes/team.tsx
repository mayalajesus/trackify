import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Description } from "@heroui/react/description";
import { Dropdown } from "@heroui/react/dropdown";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { TextField } from "@heroui/react/textfield";
import { Typography } from "@heroui/react/typography";
import { toast } from "@heroui/react/toast";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  Copy,
  PaperPlane,
  PersonPencil,
  PersonPlus,
  TrashBin,
} from "@gravity-ui/icons";
import type { InvitationEmailStatus } from "@/lib/account-data-source";
import { useRef, useState } from "react";
import { ActionDropdown } from "@/components/action-dropdown";
import { DataTable } from "@/components/data-table";
import { FormAlert } from "@/components/form-feedback";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { PageHeader } from "@/components/page-header";
import { ProfileAvatar } from "@/components/profile-avatar";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Member, Role } from "@/lib/domain";
import { useStore } from "@/lib/store";

function invitationEmailFeedback(status?: InvitationEmailStatus) {
  if (status === "accepted") return "Invitation created. The email was accepted for sending.";
  if (status === "failed")
    return "Invitation created, but the email could not be sent. Copy the link or resend the invitation.";
  if (status === "unknown" || status === "sending")
    return "Invitation created. Email sending could not be confirmed. You can share the link below.";
  if (status === "pending")
    return "Invitation created. The email is pending. You can share the link below.";
  return "Invitation created. Email sending is disabled in this environment. Share the link below.";
}

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
    preferencesByUserId,
    inviteMember,
    resendInvite,
    cancelInvite,
    removeMember,
    restoreMember,
    updateMemberRole,
  } = useStore();
  const { locale, t, error } = useI18n();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("Member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [createdEmailStatus, setCreatedEmailStatus] = useState<InvitationEmailStatus | undefined>();
  const inviteRequestRef = useRef(false);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Member | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const inviteRoles: InviteRole[] = can("manage-admins") ? ["Member", "Admin"] : ["Member"];

  const orderedMembers = [...members].sort((a, b) => {
    const rank = { invited: 0, active: 1, removed: 2 } as const;
    return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name);
  });

  const secondsFor = (id: string) =>
    entries.filter((entry) => entry.userId === id).reduce((sum, entry) => sum + entry.seconds, 0);

  const resetInviteForm = () => {
    setEmail("");
    setRole("Member");
    setInviteError(null);
    setCreatedLink("");
    setCreatedEmailStatus(undefined);
  };

  const openInvite = () => {
    resetInviteForm();
    setInviteOpen(true);
  };

  const submitInvite = async () => {
    if (inviteRequestRef.current) return;
    inviteRequestRef.current = true;
    setInviteBusy(true);
    try {
      const result = await inviteMember(email, role);
      if (!result.success) {
        setInviteError(error(result.error));
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      setCreatedLink(result.invitationUrl ?? "");
      setCreatedEmailStatus(result.emailStatus);
      toast.info(t(invitationEmailFeedback(result.emailStatus)), { description: normalizedEmail });
    } catch {
      setInviteError(t("We couldn't prepare this invitation"));
    } finally {
      inviteRequestRef.current = false;
      setInviteBusy(false);
    }
  };

  const copyInvitationLink = async (invitationUrl: string) => {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      toast.success(t("Invitation link copied"));
    } catch {
      setInviteError(t("Copy the invitation link manually."));
    }
  };

  const handleResend = async (member: Member) => {
    if (inviteRequestRef.current) return;
    inviteRequestRef.current = true;
    setInvitationActionId(member.id);
    try {
      const result = await resendInvite(member.id);
      if (!result.success) {
        toast.danger(t("We couldn't refresh this invitation"), {
          description: error(result.error),
        });
        return;
      }
      setCreatedLink(result.invitationUrl ?? "");
      setCreatedEmailStatus(result.emailStatus);
      setInviteError(null);
      setInviteOpen(true);
      toast.info(t(invitationEmailFeedback(result.emailStatus)), { description: member.email });
    } catch {
      toast.danger(t("We couldn't refresh this invitation"));
    } finally {
      inviteRequestRef.current = false;
      setInvitationActionId(null);
    }
  };

  const confirmCancel = async () => {
    if (!pendingCancel) return;
    setInvitationActionId(pendingCancel.id);
    const result = await cancelInvite(pendingCancel.id);
    setInvitationActionId(null);
    if (!result.success) {
      setCancelError(error(result.error));
      return;
    }
    toast.success(t("Invitation canceled"), { description: pendingCancel.email });
    setPendingCancel(null);
    setCancelError(null);
  };

  const handleRestore = (member: Member) => {
    const result = restoreMember(member.id);
    if (!result.success) {
      toast.danger(t("We couldn't restore access"), { description: error(result.error) });
      return;
    }
    toast.success(t("Access restored"), { description: member.email });
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
    <div className="space-y-6">
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

      <DataTable label={t("Team members")} minWidth="min-w-[680px]">
        <Table.Header>
          <Table.Column isRowHeader>{t("Member")}</Table.Column>
          <Table.Column>{t("Role")}</Table.Column>
          <Table.Column>{t("Status")}</Table.Column>
          <Table.Column>{t("Tracked")}</Table.Column>
          <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
        </Table.Header>
        <Table.Body>
          {orderedMembers.map((member) => {
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
                      <span className="truncate">
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
                <Table.Cell>
                  {invited ? "—" : formatDuration(secondsFor(member.id), locale)}
                </Table.Cell>
                <Table.Cell>
                  {invited && canManageTarget ? (
                    <div className="flex justify-end">
                      <ActionDropdown
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
                        ariaLabel={t("Actions for {name}", { name: member.name })}
                        items={[
                          {
                            id: "restore",
                            label: t("Restore access"),
                            icon: <PersonPlus className="size-4" />,
                          },
                        ]}
                        onAction={(key) => {
                          if (key === "restore") handleRestore(member);
                        }}
                      />
                    </div>
                  ) : member.status === "active" && canManageTarget ? (
                    <div className="flex justify-end">
                      <ActionDropdown
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
                        ]}
                        onAction={(key) => {
                          if (key === "role") manageRole(member);
                          if (key === "remove") {
                            setRemoveError(null);
                            setPendingRemove(member);
                          }
                        }}
                      />
                    </div>
                  ) : isCurrentMember ? (
                    <span className="sr-only">{t("No actions available for your account")}</span>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </DataTable>

      <Modal
        isOpen={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) resetInviteForm();
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label={t("Close")} />
              <ModalLayout.Header>{t("Invite member")}</ModalLayout.Header>
              <Form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitInvite();
                }}
              >
                <ModalLayout.Body>
                  {inviteError ? (
                    <FormAlert
                      title={t("We couldn't prepare this invitation")}
                      description={inviteError}
                    />
                  ) : null}

                  {createdLink ? (
                    <div className="space-y-3">
                      <Typography type="body-sm" role="status">
                        {t(invitationEmailFeedback(createdEmailStatus))}
                      </Typography>
                      <Typography type="body-sm" color="muted">
                        {t(
                          "Share this private link with the invited person. It expires in 7 days.",
                        )}
                      </Typography>
                      <TextField fullWidth name="invitation-link" value={createdLink} isReadOnly>
                        <Label>{t("Invitation link")}</Label>
                        <Input variant="secondary" />
                      </TextField>
                    </div>
                  ) : (
                    <>
                      <TextField
                        isRequired
                        fullWidth
                        name="invite-email"
                        type="email"
                        value={email}
                        validate={(value) => {
                          const normalized = value.trim().toLowerCase();
                          if (!normalized) return t("Email is required");
                          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                            return t("Enter a valid email address");
                          }
                          if (members.some((member) => member.email.toLowerCase() === normalized)) {
                            return t("This email is already part of the team");
                          }
                          return null;
                        }}
                        onChange={(value) => {
                          setEmail(value);
                          setInviteError(null);
                        }}
                      >
                        <Label>{t("Email")}</Label>
                        <Input variant="secondary" placeholder={t("name@company.com")} />
                        <Description className="text-xs">
                          {t(
                            "An invitation email will be sent. You can also copy the private link.",
                          )}
                        </Description>
                        <FieldError />
                      </TextField>

                      <div className="flex flex-col gap-2">
                        <Label>{t("Role")}</Label>
                        <Dropdown>
                          <Button
                            type="button"
                            variant="secondary"
                            aria-label={t("Choose invitation role")}
                            className="h-9 w-full justify-between gap-2 px-3"
                          >
                            <span className="truncate text-sm">{t(role)}</span>
                            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
                          </Button>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              aria-label={t("Invitation role")}
                              className="max-h-60 overflow-y-auto"
                              selectionMode="single"
                              selectedKeys={new Set([role])}
                              onAction={(key) => setRole(String(key) as InviteRole)}
                            >
                              {inviteRoles.map((option) => (
                                <Dropdown.Item key={option} id={option} textValue={option}>
                                  <Label>{t(option)}</Label>
                                  <Dropdown.ItemIndicator />
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </div>
                    </>
                  )}
                </ModalLayout.Body>
                <ModalLayout.Footer>
                  {createdLink ? (
                    <>
                      <Button slot="close" type="button" variant="secondary">
                        {t("Done")}
                      </Button>
                      <Button type="button" onPress={() => void copyInvitationLink(createdLink)}>
                        {t("Copy link")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button slot="close" type="button" variant="secondary">
                        {t("Cancel")}
                      </Button>
                      <Button type="submit" isDisabled={!email.trim()} isPending={inviteBusy}>
                        {t("Send invitation")}
                      </Button>
                    </>
                  )}
                </ModalLayout.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

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
            <Modal.Dialog>
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
            <Modal.Dialog>
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
