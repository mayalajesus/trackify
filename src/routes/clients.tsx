import { ColorSwatch } from "@heroui/react/color-swatch";
import { Button } from "@heroui/react/button";
import { Description } from "@heroui/react/description";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ProgressBar } from "@heroui/react/progress-bar";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { Switch } from "@heroui/react/switch";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@/lib/toast";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowRotateLeft,
  Copy,
  CircleDollar,
  Persons,
  Power,
  Pencil,
  Person,
  Plus,
  TrashBin,
} from "@gravity-ui/icons";
import { useState } from "react";
import { ClientColorPicker } from "@/components/client-color-picker";
import { clientColorValue, defaultClientColor } from "@/lib/client-colors";
import { ClientMembersModal } from "@/components/client-members-modal";
import { Tabs } from "@heroui/react/tabs";
import { ActionDropdown } from "@/components/action-dropdown";
import { BillableIndicator } from "@/components/billable-indicator";
import { DataTable } from "@/components/data-table";
import { FormAlert } from "@/components/form-feedback";
import { ModalLayout } from "@/components/modal-layout";
import { ModalSelect } from "@/components/modal-select";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { PageHeader } from "@/components/page-header";
import { EmptyBlock } from "@/components/states";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Client } from "@/lib/domain";
import { useStore } from "@/lib/store";
import { sortClientsByName } from "@/lib/client-order";
import { clientCurrencyOptions, defaultCurrencyForLocale, type CurrencyCode } from "@/lib/billing";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Trackify" },
      {
        name: "description",
        content: "Manage clients, contacts and the projects connected to each client.",
      },
      { property: "og:title", content: "Clients — Trackify" },
      { property: "og:description", content: "Client list with contacts and tracked time." },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const {
    clients,
    projects,
    entries,
    can,
    addClient,
    updateClient,
    deleteClient,
    workspaceBilling,
  } = useStore();
  const { locale, t, error } = useI18n();
  const [memberClient, setMemberClient] = useState<Client | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(defaultClientColor);
  const [contact, setContact] = useState("");
  const [billable, setBillable] = useState(true);
  const [contractedHours, setContractedHours] = useState("");
  const parsedContractedHours = Number(contractedHours.replace(",", "."));
  const validContractedHours =
    !contractedHours.trim() ||
    (Number.isFinite(parsedContractedHours) && parsedContractedHours > 0);
  const defaultCurrency = clientCurrencyOptions.includes(workspaceBilling.currency)
    ? workspaceBilling.currency
    : defaultCurrencyForLocale(locale);
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const projectCountFor = (clientId: string) =>
    projects.filter((project) => project.clientId === clientId).length;

  const secondsFor = (clientId: string) => {
    const ids = projects
      .filter((project) => project.clientId === clientId)
      .map((project) => project.id);
    return entries
      .filter((entry) => entry.projectId !== null && ids.includes(entry.projectId))
      .reduce((sum, entry) => sum + entry.seconds, 0);
  };

  const resetForm = () => {
    setEditingClientId(null);
    setName("");
    setContact("");
    setColor(defaultClientColor);
    setBillable(true);
    setContractedHours("");
    setCurrency(defaultCurrency);
    setFormError(null);
  };

  const save = () => {
    if (!name.trim()) return;
    if (!validContractedHours) {
      setFormError(t("Enter a positive number of contracted hours."));
      return;
    }
    const values = {
      name: name.trim(),
      contact: contact.trim(),
      color,
      billable,
      currency,
      contractedHours: contractedHours.trim() ? parsedContractedHours : null,
    };
    const result = editingClientId ? updateClient(editingClientId, values) : addClient(values);
    if (!result.success) {
      setFormError(error(result.error));
      return;
    }
    toast.success(t(editingClientId ? "Client updated" : "Client added"), {
      description: name.trim(),
    });
    resetForm();
    setFormOpen(false);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const result = deleteClient(pendingDelete.id);
    if (!result.success) {
      setDeleteError(error(result.error));
      return;
    }
    toast.success(t("Client removed"), { description: pendingDelete.name });
    setPendingDelete(null);
    setDeleteError(null);
  };

  const usedSeconds = editingClientId ? secondsFor(editingClientId) : 0;
  const usage =
    validContractedHours && parsedContractedHours > 0
      ? usedSeconds / (parsedContractedHours * 3600)
      : 0;
  const hoursStatus =
    usage > 1
      ? "Beyond the contracted limit"
      : usage >= 0.8
        ? "Approaching the contracted limit"
        : "Within the contracted limit";

  const pendingProjectCount = pendingDelete ? projectCountFor(pendingDelete.id) : 0;

  return (
    <div className="clients-page">
      <PageHeader
        title={t("Clients")}
        description={t("Manage the people and companies connected to your projects.")}
        actions={
          can("manage-clients") ? (
            <Button
              onPress={() => {
                resetForm();
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("New client")}
            </Button>
          ) : null
        }
      />

      {clients.some((client) => client.status === "archived") ? (
        <Tabs
          selectedKey={showArchived ? "archived" : "current"}
          onSelectionChange={(key) => setShowArchived(key === "archived")}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label={t("Clients")}>
              <Tabs.Tab id="current">
                {t("Clients")}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="archived">
                {t("Archived")}
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      ) : null}
      {clients.filter((client) => (client.status === "archived") === showArchived).length === 0 ? (
        <EmptyBlock
          icon={<Person className="size-5" />}
          title={t("No clients yet")}
          description={t("Add a client to connect projects and organize tracked time.")}
          action={
            can("manage-clients") ? (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  resetForm();
                  setFormOpen(true);
                }}
              >
                {t("New client")}
              </Button>
            ) : null
          }
        />
      ) : (
        <DataTable className="clients-table" label={t("Clients")} minWidth="min-w-[640px]">
          <Table.Header>
            <Table.Column isRowHeader>{t("Client")}</Table.Column>
            <Table.Column>{t("Contact")}</Table.Column>
            <Table.Column>{t("Billable")}</Table.Column>
            <Table.Column>{t("Currency")}</Table.Column>
            <Table.Column>{t("Projects")}</Table.Column>
            <Table.Column>{t("Tracked")}</Table.Column>
            <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
          </Table.Header>
          <Table.Body>
            {sortClientsByName(clients, locale)
              .filter((client) => (client.status === "archived") === showArchived)
              .map((client) => (
                <Table.Row key={client.id}>
                  <Table.Cell>
                    <span className="inline-flex items-center gap-2">
                      <ColorSwatch
                        aria-label={t("Client color")}
                        className="size-2 shrink-0 rounded-full"
                        color={clientColorValue(client.color)}
                      />
                      <span>{client.name}</span>
                    </span>
                    {client.status === "on-hold" ? (
                      <span className="ml-2 text-xs text-muted">{t("Inactive")}</span>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>{client.contact || "—"}</Table.Cell>
                  <Table.Cell>
                    <BillableIndicator billable={client.billable ?? false} />
                  </Table.Cell>
                  <Table.Cell>{client.currency ?? workspaceBilling.currency}</Table.Cell>
                  <Table.Cell>{projectCountFor(client.id)}</Table.Cell>
                  <Table.Cell>{formatDuration(secondsFor(client.id), locale)}</Table.Cell>
                  <Table.Cell>
                    {can("manage-clients") ? (
                      <div className="flex justify-end">
                        <ActionDropdown
                          ariaLabel={t("Actions for {name}", { name: client.name })}
                          menuClassName="client-action-menu"
                          items={[
                            {
                              id: "members",
                              label: t("Manage members"),
                              icon: <Persons className="size-4" />,
                            },
                            {
                              id: "edit",
                              label: t("Edit client"),
                              icon: <Pencil className="size-4" />,
                            },
                            {
                              id: "duplicate",
                              label: t("Duplicate client"),
                              icon: <Copy className="size-4" />,
                            },
                            {
                              id: "active",
                              label: t(client.status === "on-hold" ? "Inactive" : "Active"),
                              icon: <Power className="size-4" />,
                              isSelected: (client.status ?? "active") === "active",
                              isDisabled: client.status === "archived",
                            },
                            {
                              id: "billing",
                              label: t(client.billable ? "Make internal" : "Make billable"),
                              icon: <CircleDollar className="size-4" />,
                            },
                            {
                              id: "archive",
                              label: t(
                                client.status === "archived" ? "Restore client" : "Archive client",
                              ),
                              icon:
                                client.status === "archived" ? (
                                  <ArrowRotateLeft className="size-4" />
                                ) : (
                                  <Archive className="size-4" />
                                ),
                              tone: "warning",
                            },
                            ...(client.status === "archived"
                              ? [
                                  {
                                    id: "delete",
                                    label: t("Delete client"),
                                    icon: <TrashBin className="size-4" />,
                                    tone: "danger" as const,
                                  },
                                ]
                              : []),
                          ]}
                          onAction={(key) => {
                            if (key === "members") {
                              setMemberClient(client);
                              return;
                            }
                            if (["duplicate", "active", "billing", "archive"].includes(key)) {
                              const result =
                                key === "duplicate"
                                  ? addClient({
                                      ...client,
                                      name: `${client.name} (${t("Copy")})`,
                                      status: "active",
                                      memberIds: client.memberIds ?? [],
                                    })
                                  : updateClient(
                                      client.id,
                                      key === "billing"
                                        ? { billable: !client.billable }
                                        : {
                                            status:
                                              key === "archive"
                                                ? client.status === "archived"
                                                  ? "active"
                                                  : "archived"
                                                : client.status === "on-hold"
                                                  ? "active"
                                                  : "on-hold",
                                          },
                                    );
                              if (!result.success) {
                                toast.danger(error(result.error));
                                return;
                              }
                              if (
                                key === "duplicate" ||
                                (key === "archive" && client.status === "archived")
                              ) {
                                setShowArchived(false);
                              }
                              toast.success(
                                t(
                                  key === "duplicate"
                                    ? "Client duplicated"
                                    : key === "archive"
                                      ? client.status === "archived"
                                        ? "Client restored"
                                        : "Client archived"
                                      : "Client updated",
                                ),
                              );
                              return;
                            }
                            if (key === "edit") {
                              setEditingClientId(client.id);
                              setName(client.name);
                              setContact(client.contact);
                              setColor(clientColorValue(client.color));
                              setBillable(client.billable ?? false);
                              setContractedHours(
                                client.contractedHours == null
                                  ? ""
                                  : String(client.contractedHours),
                              );
                              setCurrency(client.currency ?? defaultCurrency);
                              setFormError(null);
                              setFormOpen(true);
                            }
                            if (key === "delete") {
                              if (projectCountFor(client.id) > 0) {
                                toast.warning(t("This client still has projects"), {
                                  description: t(
                                    "{name} is connected to {count} project{suffix}. Remove or reassign those projects first.",
                                    {
                                      name: client.name,
                                      count: projectCountFor(client.id),
                                      suffix: projectCountFor(client.id) === 1 ? "" : "s",
                                    },
                                  ),
                                });
                                return;
                              }
                              setDeleteError(null);
                              setPendingDelete(client);
                            }
                          }}
                        />
                      </div>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
          </Table.Body>
        </DataTable>
      )}

      <Modal
        isOpen={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog className="client-form-modal">
              <Modal.CloseTrigger />
              <ModalLayout.Header>
                {t(editingClientId ? "Edit client" : "New client")}
              </ModalLayout.Header>
              <Form
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <ModalLayout.Body className="gap-3">
                  {formError ? (
                    <FormAlert
                      title={t(
                        editingClientId
                          ? "We couldn't update this client"
                          : "We couldn't add this client",
                      )}
                      description={formError}
                    />
                  ) : null}

                  <TextField
                    isRequired
                    fullWidth
                    name="client-name"
                    value={name}
                    validate={(value) => (value.trim() ? null : t("Client name is required"))}
                    onChange={(value) => {
                      setName(value);
                      setFormError(null);
                    }}
                  >
                    <Label>{t("Name")}</Label>
                    <Input variant="secondary" placeholder={t("e.g. Northwind Coffee")} />
                    <FieldError />
                  </TextField>

                  <TextField
                    fullWidth
                    name="client-contact"
                    type="email"
                    value={contact}
                    validate={(value) =>
                      !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
                        ? null
                        : t("Enter a valid email address")
                    }
                    onChange={(value) => {
                      setContact(value);
                      setFormError(null);
                    }}
                  >
                    <Label>{t("Contact")}</Label>
                    <Input variant="secondary" placeholder={t("name@company.com")} />
                    <Description className="text-xs">{t("Optional")}</Description>
                    <FieldError />
                  </TextField>
                  <Switch name="client-billable" isSelected={billable} onChange={setBillable}>
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Label>{t("Billable")}</Label>
                    </Switch.Content>
                  </Switch>
                  <ClientColorPicker value={color} onChange={setColor} />
                  <ModalSelect
                    label={t("Currency")}
                    buttonAriaLabel={t("Choose currency")}
                    value={currency}
                    options={clientCurrencyOptions.map((option) => ({ id: option, label: option }))}
                    onChange={(value) => setCurrency(value as CurrencyCode)}
                  />
                  <section className="space-y-2" aria-label={t("Contracted hours")}>
                    <TextField
                      fullWidth
                      name="client-contracted-hours"
                      value={contractedHours}
                      onChange={setContractedHours}
                      validate={() =>
                        validContractedHours
                          ? null
                          : t("Enter a positive number of contracted hours.")
                      }
                    >
                      <Label>{t("Contracted hours")}</Label>
                      <Input
                        variant="secondary"
                        inputMode="decimal"
                        placeholder={t("Enter the total contracted hours")}
                      />
                      <FieldError />
                    </TextField>
                    <div className="space-y-1">
                      <div className="flex items-center gap-0.5">
                        <ProgressBar
                          aria-label={t("Contracted hours usage")}
                          aria-valuetext={t(hoursStatus)}
                          value={Math.min(usage * 100, 100)}
                          className="min-w-0 flex-1"
                          size="sm"
                        >
                          <ProgressBar.Track className="h-[5px] rounded-full bg-[#EEEEEE]">
                            <ProgressBar.Fill
                              className={usage >= 0.8 ? "bg-[#9C5D0F]" : "bg-[#147A4D]"}
                            />
                          </ProgressBar.Track>
                        </ProgressBar>
                        {usage > 1 ? (
                          <span
                            aria-hidden="true"
                            className="h-[5px] w-14 shrink-0 rounded-full bg-danger"
                          />
                        ) : (
                          <span aria-hidden="true" className="w-14 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted" aria-live="polite">
                        {t(hoursStatus)}
                      </p>
                    </div>
                  </section>
                </ModalLayout.Body>
                <ModalLayout.Footer>
                  <Button slot="close" type="button" variant="secondary">
                    {t("Cancel")}
                  </Button>
                  <Button type="submit" isDisabled={!name.trim() || !validContractedHours}>
                    {t(editingClientId ? "Save changes" : "Create client")}
                  </Button>
                </ModalLayout.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog className="client-delete-modal">
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Delete client?")}</ModalLayout.Header>
              <ModalLayout.Body>
                {deleteError ? (
                  <FormAlert
                    title={t("We couldn't delete this client")}
                    description={deleteError}
                  />
                ) : null}
                {pendingProjectCount > 0 ? (
                  <FormAlert
                    status="warning"
                    title={t("This client still has projects")}
                    description={t(
                      "{name} is connected to {count} project{suffix}. Remove or reassign those projects first.",
                      {
                        name: pendingDelete?.name ?? t("This client"),
                        count: pendingProjectCount,
                        suffix: pendingProjectCount === 1 ? "" : "s",
                      },
                    )}
                  />
                ) : null}
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary">
                  {t("Cancel")}
                </Button>
                <Button
                  variant="danger"
                  isDisabled={pendingProjectCount > 0}
                  onPress={confirmDelete}
                >
                  {t("Delete client")}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      {memberClient ? (
        <ClientMembersModal
          key={memberClient.id}
          client={memberClient}
          onClose={() => setMemberClient(null)}
        />
      ) : null}
    </div>
  );
}
