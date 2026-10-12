import type { Role } from "../domain";
import { inviteEmailPattern } from "./ids";
import { createIdentity } from "./membership";
import type { StoreResult } from "./types";
export function createMemberActions({
  can,
  members,
  dataSource,
  activeWorkspaceId,
  setMembers,
  setAccount,
  activeMemberId,
  currentMember,
  setProjects,
}: {
  can: (permission: import("@/lib/permissions").Permission) => boolean;
  members: import("@/lib/domain").Member[];
  dataSource: import("@/lib/account-data-source").AccountDataSource;
  activeWorkspaceId: string;
  setMembers: React.Dispatch<React.SetStateAction<import("@/lib/domain").Member[]>>;
  setAccount: React.Dispatch<React.SetStateAction<import("@/lib/account-types").PersistedAccount>>;
  activeMemberId: string;
  currentMember: import("@/lib/domain").Member | null;
  setProjects: React.Dispatch<React.SetStateAction<import("@/lib/domain").Project[]>>;
}) {
  const inviteMember = async (
    email: string,
    role: Exclude<Role, "Owner">,
  ): Promise<StoreResult> => {
    if (!can("manage-members"))
      return { success: false, error: "Only Admins and the Owner can invite members." };
    const normalizedEmail = email.trim().toLowerCase();
    if (!inviteEmailPattern.test(normalizedEmail))
      return { success: false, error: "Enter a valid email address." };
    if (role !== "Admin" && role !== "Member")
      return { success: false, error: "Choose a valid role for this invitation." };
    if (role === "Admin" && !can("manage-admins"))
      return { success: false, error: "Only the Owner can invite Admins." };
    if (members.filter((member) => member.status !== "removed").length >= 50)
      return {
        success: false,
        error: "This workspace has reached its limit of 50 members and invitations.",
      };
    if (members.some((member) => member.email.toLowerCase() === normalizedEmail))
      return {
        success: false,
        error: "This email is already part of the team or has a pending invitation.",
      };
    const response = await dataSource.inviteMember(activeWorkspaceId, normalizedEmail, role);
    if (!response.success) return response;
    const { member: invitation, invitationUrl } = response.data;
    setMembers((list) => [invitation, ...list]);
    setAccount((current) => ({
      ...current,
      identities: current.identities.some((identity) => identity.id === invitation.id)
        ? current.identities
        : [...current.identities, createIdentity(invitation)],
    }));
    return {
      success: true,
      id: invitation.id,
      invitationUrl,
      emailStatus: response.data.emailStatus,
    };
  };

  const resendInvite = async (memberId: string): Promise<StoreResult> => {
    if (!can("manage-members"))
      return { success: false, error: "Only Admins and the Owner can manage invitations." };
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member || member.status !== "invited")
      return { success: false, error: "Only pending invitations can be resent." };
    if (member.role === "Admin" && !can("manage-admins"))
      return { success: false, error: "Only the Owner can manage Admin invitations." };
    const response = await dataSource.resendInvitation(activeWorkspaceId, memberId);
    if (!response.success) return response;
    setMembers((list) =>
      list.map((candidate) => (candidate.id === memberId ? response.data.member : candidate)),
    );
    return {
      success: true,
      invitationUrl: response.data.invitationUrl,
      emailStatus: response.data.emailStatus,
    };
  };

  const cancelInvite = async (memberId: string): Promise<StoreResult> => {
    if (!can("manage-members"))
      return { success: false, error: "Only Admins and the Owner can manage invitations." };
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member || member.status !== "invited")
      return { success: false, error: "Only pending invitations can be canceled." };
    if (member.role === "Admin" && !can("manage-admins"))
      return { success: false, error: "Only the Owner can manage Admin invitations." };
    const response = await dataSource.cancelInvitation(activeWorkspaceId, memberId);
    if (!response.success) return response;
    setMembers((list) => list.filter((candidate) => candidate.id !== memberId));
    setAccount((current) => ({
      ...current,
      identities: current.identities.filter((identity) => identity.id !== memberId),
    }));
    return { success: true };
  };

  const removeMember = (memberId: string): StoreResult => {
    if (!can("manage-members"))
      return { success: false, error: "Only Admins and the Owner can remove members." };
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member) return { success: false, error: "This team member no longer exists." };
    if (memberId === activeMemberId && currentMember?.role === "Owner")
      return { success: false, error: "The Owner cannot remove their own account." };
    if (member.status !== "active")
      return { success: false, error: "Only active members can be removed." };
    if (member.role === "Owner")
      return { success: false, error: "The workspace owner cannot be removed." };
    if (member.role === "Admin" && !can("manage-admins"))
      return { success: false, error: "Only the Owner can remove Admins." };
    const activeAdmins = members.filter(
      (candidate) => candidate.status === "active" && candidate.role === "Admin",
    );
    if (member.role === "Admin" && activeAdmins.length <= 1)
      return { success: false, error: "The last admin cannot be removed." };
    setMembers((list) =>
      list.map((candidate) =>
        candidate.id === memberId ? { ...candidate, status: "removed" } : candidate,
      ),
    );
    setProjects((list) =>
      list.map((project) => ({
        ...project,
        memberIds: project.memberIds.filter((id) => id !== memberId),
      })),
    );
    return { success: true };
  };

  const restoreMember = (memberId: string): StoreResult => {
    if (!can("manage-members"))
      return { success: false, error: "Only Admins and the Owner can restore members." };
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member || member.status !== "removed")
      return { success: false, error: "Only removed members can be restored." };
    if (member.role === "Admin" && !can("manage-admins"))
      return { success: false, error: "Only the Owner can restore Admins." };
    setMembers((list) =>
      list.map((candidate) =>
        candidate.id === memberId ? { ...candidate, status: "active" } : candidate,
      ),
    );
    return { success: true };
  };

  const updateMemberRole = (memberId: string, role: Exclude<Role, "Owner">): StoreResult => {
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member) return { success: false, error: "This team member no longer exists." };
    if (memberId === activeMemberId && currentMember?.role === "Owner")
      return { success: false, error: "The Owner cannot change their own role." };
    if (member.role === "Owner")
      return { success: false, error: "The workspace owner role cannot be changed." };
    if (role !== "Admin" && role !== "Member")
      return { success: false, error: "Choose a valid team role." };
    if (currentMember?.role === "Admin" && member.role !== "Member")
      return { success: false, error: "Admins can only manage Members." };
    if (!can("manage-members"))
      return { success: false, error: "Only Admins and the Owner can change roles." };
    if (member.role === "Admin" && role === "Member") {
      if (!can("manage-admins"))
        return { success: false, error: "Only the Owner can reassign Admin roles." };
    }
    setMembers((list) =>
      list.map((candidate) => (candidate.id === memberId ? { ...candidate, role } : candidate)),
    );
    return { success: true };
  };
  return {
    inviteMember,
    resendInvite,
    cancelInvite,
    removeMember,
    restoreMember,
    updateMemberRole,
  };
}
