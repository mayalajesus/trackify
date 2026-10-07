import { Button } from "@heroui/react/button";
import { Description } from "@heroui/react/description";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { Switch } from "@heroui/react/switch";
import { TextField } from "@heroui/react/textfield";
import { Typography } from "@heroui/react/typography";
import { toast } from "@heroui/react/toast";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Person, Plus, TrashBin } from "@gravity-ui/icons";
import { useState } from "react";
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [billable, setBillable] = useState(false);
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
    setBillable(false);
    setCurrency(defaultCurrency);
    setFormError(null);
  };

  const save = () => {
    if (!name.trim()) return;
    const values = { name: name.trim(), contact: contact.trim(), billable, currency };
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

  const pendingProjectCount = pendingDelete ? projectCountFor(pendingDelete.id) : 0;

  return (
    <div className="space-y-6">
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

      {clients.length === 0 ? (
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
        <DataTable label={t("Clients")} minWidth="min-w-[640px]">
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
            {clients.map((client) => (
              <Table.Row key={client.id}>
                <Table.Cell>{client.name}</Table.Cell>
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
                        items={[
                          {
                            id: "edit",
                            label: t("Edit client"),
                            icon: <Pencil className="size-4" />,
                          },
                          {
                            id: "delete",
                            label: t("Delete client"),
                            icon: <TrashBin className="size-4" />,
                            tone: "danger",
                          },
                        ]}
                        onAction={(key) => {
                          if (key === "edit") {
                            setEditingClientId(client.id);
                            setName(client.name);
                            setContact(client.contact);
                            setBillable(client.billable ?? false);
                            setCurrency(client.currency ?? defaultCurrency);
                            setFormError(null);
                            setFormOpen(true);
                          }
                          if (key === "delete") {
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
            <Modal.Dialog>
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
                <ModalLayout.Body>
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
                  <ModalSelect
                    label={t("Currency")}
                    buttonAriaLabel={t("Choose currency")}
                    value={currency}
                    options={clientCurrencyOptions.map((option) => ({ id: option, label: option }))}
                    onChange={(value) => setCurrency(value as CurrencyCode)}
                  />
                </ModalLayout.Body>
                <ModalLayout.Footer>
                  <Button slot="close" type="button" variant="secondary">
                    {t("Cancel")}
                  </Button>
                  <Button type="submit" isDisabled={!name.trim()}>
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
            <Modal.Dialog>
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
                ) : (
                  <Typography type="body-sm" color="muted">
                    {t(
                      "This permanently removes {name}. Tracked time entries without a direct client relationship remain unchanged.",
                      {
                        name: pendingDelete?.name ?? t("this client"),
                      },
                    )}
                  </Typography>
                )}
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
    </div>
  );
}
