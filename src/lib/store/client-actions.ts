import { clientCurrencyOptions, defaultCurrencyForLocale } from "../billing";
import type { Client } from "../domain";
import { clientColorValue, isClientColor } from "../client-colors";
import { nextId } from "./ids";
import type { StoreResult } from "./types";

export function createClientActions({
  can,
  members,
  setClients,
  workspaceBilling,
  preferences,
  clients,
  projects,
}: {
  can: (permission: import("@/lib/permissions").Permission) => boolean;
  members: import("@/lib/domain").Member[];
  setClients: React.Dispatch<React.SetStateAction<import("@/lib/domain").Client[]>>;
  workspaceBilling: import("@/lib/billing").BillingPreference;
  preferences: import("@/lib/account-types").UserPreferences;
  clients: import("@/lib/domain").Client[];
  projects: import("@/lib/domain").Project[];
}) {
  const addClient = (client: Omit<Client, "id">): StoreResult => {
    if (!can("manage-clients"))
      return { success: false, error: "Only Admins and the Owner can manage clients." };
    if (client.color !== undefined && !isClientColor(client.color))
      return { success: false, error: "Choose a valid client color." };
    if (!client.name.trim()) return { success: false, error: "A client name is required." };
    if (client.status !== undefined && !["active", "on-hold", "archived"].includes(client.status))
      return { success: false, error: "Choose a valid client status." };
    if (
      client.memberIds?.some(
        (id) => !members.some((member) => member.id === id && member.status !== "removed"),
      )
    )
      return { success: false, error: "Only workspace members can be assigned to a client." };
    if (client.currency !== undefined && !clientCurrencyOptions.includes(client.currency))
      return { success: false, error: "Choose a valid currency." };
    if (
      client.contractedHours != null &&
      (typeof client.contractedHours !== "number" ||
        !Number.isFinite(client.contractedHours) ||
        client.contractedHours <= 0)
    )
      return { success: false, error: "Enter a positive number of contracted hours." };
    setClients((list) => [
      {
        id: nextId(
          "c",
          list.map((current) => current.id),
        ),
        name: client.name.trim(),
        color: clientColorValue(client.color),
        contact: client.contact.trim(),
        billable: client.billable ?? false,
        contractedHours: client.contractedHours ?? null,
        status: client.status ?? "active",
        memberIds: [...new Set(client.memberIds ?? [])],
        currency:
          client.currency ??
          (clientCurrencyOptions.includes(workspaceBilling.currency)
            ? workspaceBilling.currency
            : defaultCurrencyForLocale(preferences.language)),
      },
      ...list,
    ]);
    return { success: true };
  };

  const updateClient = (id: string, patch: Partial<Client>): StoreResult => {
    if (!can("manage-clients"))
      return { success: false, error: "Only Admins and the Owner can manage clients." };
    if (patch.color !== undefined && !isClientColor(patch.color))
      return { success: false, error: "Choose a valid client color." };
    if (patch.status !== undefined && !["active", "on-hold", "archived"].includes(patch.status))
      return { success: false, error: "Choose a valid client status." };
    if (
      patch.memberIds !== undefined &&
      patch.memberIds.some(
        (id) => !members.some((member) => member.id === id && member.status !== "removed"),
      )
    )
      return { success: false, error: "Only workspace members can be assigned to a client." };
    if (patch.currency !== undefined && !clientCurrencyOptions.includes(patch.currency))
      return { success: false, error: "Choose a valid currency." };
    if (
      patch.contractedHours != null &&
      (typeof patch.contractedHours !== "number" ||
        !Number.isFinite(patch.contractedHours) ||
        patch.contractedHours <= 0)
    )
      return { success: false, error: "Enter a positive number of contracted hours." };
    const current = clients.find((client) => client.id === id);
    if (!current) return { success: false, error: "This client no longer exists." };
    const next = {
      ...current,
      ...patch,
      color: clientColorValue(patch.color ?? current.color),
      name: (patch.name ?? current.name).trim(),
      contact: (patch.contact ?? current.contact).trim(),
    };
    if (!next.name) return { success: false, error: "A client name is required." };
    setClients((list) => list.map((client) => (client.id === id ? next : client)));
    return { success: true };
  };

  const deleteClient = (id: string): StoreResult => {
    if (!can("manage-clients"))
      return { success: false, error: "Only Admins and the Owner can manage clients." };
    const current = clients.find((client) => client.id === id);
    if (!current) return { success: false, error: "This client no longer exists." };
    const linkedProjects = projects.filter((project) => project.clientId === id);
    if (linkedProjects.length > 0)
      return {
        success: false,
        error: `This client is used by ${linkedProjects.length} project${linkedProjects.length === 1 ? "" : "s"}. Remove or reassign those projects first.`,
      };
    setClients((list) => list.filter((client) => client.id !== id));
    return { success: true };
  };
  return { addClient, updateClient, deleteClient };
}
