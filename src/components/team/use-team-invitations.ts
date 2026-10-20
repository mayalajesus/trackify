import { useRef, useState } from "react";
import type { InvitationEmailStatus } from "@/lib/account-data-source";
import type { Member, Role } from "@/lib/domain";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";

export function invitationEmailFeedback(status?: InvitationEmailStatus) {
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

export function useTeamInvitations() {
  const { members, can, inviteMember, resendInvite, cancelInvite } = useStore();
  const { t, error } = useI18n();
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
  const inviteRoles: InviteRole[] = can("manage-admins") ? ["Member", "Admin"] : ["Member"];

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

  return {
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
    invitationActionId,
    pendingCancel,
    setPendingCancel,
    cancelError,
    setCancelError,
    inviteRoles,
    resetInviteForm,
    openInvite,
    submitInvite,
    copyInvitationLink,
    handleResend,
    confirmCancel,
  };
}
