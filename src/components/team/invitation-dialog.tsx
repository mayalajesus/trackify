import { Button } from "@heroui/react/button";
import { Description } from "@heroui/react/description";
import { Dropdown } from "@heroui/react/dropdown";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { TextField } from "@heroui/react/textfield";
import { Typography } from "@heroui/react/typography";
import { ChevronDown } from "@gravity-ui/icons";
import { FormAlert } from "../form-feedback";
import { ModalLayout } from "../modal-layout";
import { ModalTriggerRegistration } from "../overlay-trigger-registration";
import { useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/domain";
import { invitationEmailFeedback, type useTeamInvitations } from "./use-team-invitations";
type InviteRole = Exclude<Role, "Owner">;

export function TeamInvitationDialog({
  invitation,
}: {
  invitation: ReturnType<typeof useTeamInvitations>;
}) {
  const { t } = useI18n();
  const {
    members,
    inviteOpen,
    setInviteOpen,
    email,
    setEmail,
    role,
    setRole,
    inviteError,
    setInviteError,
    inviteBusy,
    createdLink,
    createdEmailStatus,
    inviteRoles,
    resetInviteForm,
    submitInvite,
    copyInvitationLink,
  } = invitation;
  return (
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
          <Modal.Dialog className="team-modal">
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
                      {t("Share this private link with the invited person. It expires in 7 days.")}
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
                        {t("An invitation email will be sent. You can also copy the private link.")}
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
                      {t("Create invitation link")}
                    </Button>
                  </>
                )}
              </ModalLayout.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
