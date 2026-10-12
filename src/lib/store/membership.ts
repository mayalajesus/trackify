import type { UserIdentity, WorkspaceMembership } from "../account-types";
import { defaultCurrencyForLocale, type BillingPreference } from "../billing";
import type { Member } from "../domain";
import { defaultLocale } from "../i18n";

export function membershipToMember(
  membership: WorkspaceMembership,
  identities: UserIdentity[],
): Member | null {
  const identity = identities.find((candidate) => candidate.id === membership.userId);
  if (!identity) return null;
  return {
    ...identity,
    role: membership.role,
    status: membership.status,
    ...(membership.invitedAt ? { invitedAt: membership.invitedAt } : {}),
  };
}

export function membersToMemberships(
  workspaceId: string,
  members: Member[],
  existingMemberships: WorkspaceMembership[] = [],
  billingByUserId: Record<string, BillingPreference> = {},
): WorkspaceMembership[] {
  const existingByUserId = new Map(
    existingMemberships.map((membership) => [membership.userId, membership]),
  );
  return members.map((member) => {
    const billing = billingByUserId[member.id] ?? existingByUserId.get(member.id);
    return {
      ...existingByUserId.get(member.id),
      workspaceId,
      userId: member.id,
      role: member.role,
      status: member.status,
      hourlyRate: billing?.hourlyRate ?? 0,
      currency: billing?.currency ?? defaultCurrencyForLocale(defaultLocale),
      ...(member.invitedAt ? { invitedAt: member.invitedAt } : {}),
    };
  });
}

export function createIdentity(member: Member): UserIdentity {
  return { id: member.id, name: member.name, email: member.email, initials: member.initials };
}

export function initialsFromName(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}
