import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Description } from "@heroui/react/description";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { TextField } from "@heroui/react/textfield";
import { Toolbar } from "@heroui/react/toolbar";
import { Typography } from "@heroui/react/typography";
import { toast } from "@heroui/react/toast";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowRightFromSquare,
  ArrowRotateLeft,
  ArrowUpRightFromSquare,
  CloudArrowUpIn,
  Layers,
  Pencil,
  Plus,
} from "@gravity-ui/icons";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FormAlert } from "@/components/form-feedback";
import { DataTable } from "@/components/data-table";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { ModalSelect } from "@/components/modal-select";
import { PageHeader } from "@/components/page-header";
import { EmptyBlock } from "@/components/states";
import { useI18n } from "@/lib/i18n";
import { useStore, type WorkspaceSummary } from "@/lib/store";
import {
  currencyOptions,
  defaultCurrencyForLocale,
  parseHourlyRateInput,
  type CurrencyCode,
} from "@/lib/billing";

export const Route = createFileRoute("/workspaces")({
  head: () => ({
    meta: [
      { title: "Workspaces — Trackify" },
      { name: "description", content: "Create and manage your Trackify workspaces." },
      { property: "og:title", content: "Workspaces — Trackify" },
      {
        property: "og:description",
        content: "Switch between focused workspaces and shared teams.",
      },
    ],
  }),
  component: WorkspacesPage,
});

type Confirmation = { kind: "archive" | "restore" | "leave"; workspace: WorkspaceSummary } | null;

function initialsForWorkspace(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function WorkspaceLogo({
  workspace,
  size = "md",
}: {
  workspace: WorkspaceSummary;
  size?: "sm" | "md";
}) {
  const avatarSize: "sm" | "md" = size === "sm" ? "sm" : "md";
  return (
    <Avatar size={avatarSize} aria-label={workspace.name} className="shrink-0">
      {workspace.logoDataUrl ? <Avatar.Image alt="" src={workspace.logoDataUrl} /> : null}
      <Avatar.Fallback>{initialsForWorkspace(workspace.name)}</Avatar.Fallback>
    </Avatar>
  );
}

function readLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("type"));
  }
  if (file.size > 500_000) return Promise.reject(new Error("size"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read"));
    });
    reader.addEventListener("error", () => reject(new Error("read")));
    reader.readAsDataURL(file);
  });
}

function WorkspacesPage() {
  const {
    workspaces,
    activeWorkspaceId,
    settings,
    timer,
    createWorkspace,
    updateWorkspace,
    setWorkspaceBilling,
    setWorkspaceSettings,
    archiveWorkspace,
    restoreWorkspace,
    leaveWorkspace,
    switchWorkspace,
    pauseTimer,
  } = useStore();
  const { locale, t, error } = useI18n();
  const navigate = Route.useNavigate();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [editWorkspace, setEditWorkspace] = useState<WorkspaceSummary | null>(null);
  const [name, setName] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<"monday" | "sunday">(settings.weekStart);
  const [hourlyRate, setHourlyRate] = useState("0.00");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrencyForLocale(locale));
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);

  const owned = workspaces.filter((workspace) => workspace.isOwned);
  const shared = workspaces.filter((workspace) => !workspace.isOwned);
  const isArchivingCurrent =
    confirmation?.kind === "archive" && confirmation.workspace.id === activeWorkspaceId;
  const hasAnotherActiveWorkspace = workspaces.some(
    (workspace) => workspace.id !== activeWorkspaceId && workspace.status === "active",
  );
  const parsedHourlyRate = parseHourlyRateInput(hourlyRate);
  const hourlyRateError = !hourlyRate.trim()
    ? t("Hourly rate is required.")
    : hourlyRate.trim().startsWith("-")
      ? t("Hourly rate must be zero or greater.")
      : parsedHourlyRate === null
        ? t("Enter a valid hourly rate with up to two decimal places.")
        : undefined;

  useEffect(() => {
    if (editWorkspace) {
      setName(editWorkspace.name);
      setLogoDataUrl(editWorkspace.logoDataUrl);
      setWeekStart(settings.weekStart);
      setHourlyRate(editWorkspace.hourlyRate.toFixed(2));
      setCurrency(editWorkspace.currency);
    }
  }, [editWorkspace, settings.weekStart]);

  const resetForm = () => {
    setName("");
    setLogoDataUrl(null);
    setHourlyRate("0.00");
    setCurrency(defaultCurrencyForLocale(locale));
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setCreateOpen(true);
  };

  const openEdit = (workspace: WorkspaceSummary) => {
    setFormError(null);
    setEditWorkspace(workspace);
  };

  const handleLogo = (file: File | undefined) => {
    if (!file) return;
    void readLogo(file)
      .then(setLogoDataUrl)
      .then(() => setFormError(null))
      .catch((reason: Error) => {
        setFormError(
          reason.message === "type"
            ? "Choose a PNG, JPG or WebP logo."
            : reason.message === "size"
              ? "Workspace logos must be smaller than 500 KB."
              : t("The workspace logo couldn't be read. Try another image."),
        );
      });
  };

  const submitCreate = async () => {
    if (parsedHourlyRate === null) {
      setFormError(
        hourlyRateError ?? t("Enter a valid hourly rate with up to two decimal places."),
      );
      return;
    }
    setCreateBusy(true);
    const result = await createWorkspace(
      name,
      { hourlyRate: parsedHourlyRate, currency },
      logoDataUrl,
    );
    setCreateBusy(false);
    if (!result.success) {
      setFormError(error(result.error));
      return;
    }
    toast.success(t("Workspace created"), { description: name.trim() });
    setCreateOpen(false);
    resetForm();
    navigate({ to: "/tracker" });
  };

  const submitEdit = () => {
    if (!editWorkspace) return;
    if (editWorkspace.isOwned && !name.trim()) {
      setFormError(t("Workspace name is required"));
      return;
    }
    if (parsedHourlyRate === null) {
      setFormError(
        hourlyRateError ?? t("Enter a valid hourly rate with up to two decimal places."),
      );
      return;
    }
    if (editWorkspace.isOwned) {
      const settingsResult = setWorkspaceSettings({ weekStart });
      if (!settingsResult.success) {
        setFormError(error(settingsResult.error));
        return;
      }
      const result = updateWorkspace(editWorkspace.id, { name, logoDataUrl });
      if (!result.success) {
        setFormError(error(result.error));
        return;
      }
    }
    const billingResult = setWorkspaceBilling(editWorkspace.id, {
      hourlyRate: parsedHourlyRate,
      currency,
    });
    if (!billingResult.success) {
      setFormError(error(billingResult.error));
      return;
    }
    toast.success(t("Workspace updated"), { description: name.trim() });
    setEditWorkspace(null);
    resetForm();
  };

  const openWorkspace = (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) {
      navigate({ to: "/tracker" });
      return;
    }
    if (timer.status === "running") {
      setPendingWorkspaceId(workspaceId);
      setSwitchOpen(true);
      return;
    }
    const result = switchWorkspace(workspaceId);
    if (!result.success) {
      setPageError(error(result.error));
      return;
    }
    setPageError(null);
    navigate({ to: "/tracker" });
  };

  const confirmSwitch = () => {
    if (!pendingWorkspaceId) return;
    pauseTimer();
    const result = switchWorkspace(pendingWorkspaceId);
    if (!result.success) {
      setPageError(error(result.error));
      return;
    }
    setSwitchOpen(false);
    setPendingWorkspaceId(null);
    navigate({ to: "/tracker" });
  };

  const confirmWorkspaceAction = () => {
    if (!confirmation) return;
    const result =
      confirmation.kind === "archive"
        ? archiveWorkspace(confirmation.workspace.id)
        : confirmation.kind === "restore"
          ? restoreWorkspace(confirmation.workspace.id)
          : leaveWorkspace(confirmation.workspace.id);
    if (!result.success) {
      setPageError(error(result.error));
      return;
    }
    toast.success(
      t(
        confirmation.kind === "archive"
          ? "Workspace archived"
          : confirmation.kind === "restore"
            ? "Workspace restored"
            : "Left workspace",
      ),
    );
    setConfirmation(null);
  };

  const renderWorkspaceRow = (workspace: WorkspaceSummary) => {
    const isCurrent = workspace.id === activeWorkspaceId;
    const canEdit = workspace.status === "active";
    const ownerLabel = workspace.isOwned
      ? t("Owned by you")
      : t("Owned by {name}", { name: workspace.ownerName });

    return (
      <Table.Row key={workspace.id}>
        <Table.Cell>
          <div className="flex min-w-0 items-center gap-3">
            <WorkspaceLogo workspace={workspace} size="sm" />
            <div className="flex min-w-0 items-center gap-2">
              <Typography type="body-sm" weight="semibold" truncate>
                {workspace.name}
              </Typography>
              {isCurrent ? (
                <Chip size="sm" variant="soft">
                  {t("Current")}
                </Chip>
              ) : null}
            </div>
          </div>
        </Table.Cell>
        <Table.Cell>
          <Typography type="body-sm" color="muted" truncate>
            {ownerLabel}
          </Typography>
        </Table.Cell>
        <Table.Cell>
          <Typography type="body-sm">{t(workspace.role)}</Typography>
        </Table.Cell>
        <Table.Cell>
          <Chip
            color={workspace.status === "active" ? "success" : "default"}
            size="sm"
            variant="soft"
          >
            {workspace.status === "archived" ? t("Archived") : t("Active")}
          </Chip>
        </Table.Cell>
        <Table.Cell>
          <Toolbar
            aria-label={t("Actions for {name}", { name: workspace.name })}
            className="ml-auto"
          >
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t("Open {name}", { name: workspace.name })}
              onPress={() => openWorkspace(workspace.id)}
            >
              <ArrowUpRightFromSquare aria-hidden="true" />
            </Button>
            {canEdit ? (
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t("Edit {name}", { name: workspace.name })}
                onPress={() => openEdit(workspace)}
              >
                <Pencil aria-hidden="true" />
              </Button>
            ) : null}
            {workspace.isOwned && workspace.status === "active" ? (
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t("Archive {name}", { name: workspace.name })}
                onPress={() => setConfirmation({ kind: "archive", workspace })}
              >
                <Chip color="warning" size="sm" variant="tertiary" className="px-0 py-0">
                  <Archive aria-hidden="true" />
                </Chip>
              </Button>
            ) : null}
            {workspace.isOwned && workspace.status === "archived" ? (
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t("Restore {name}", { name: workspace.name })}
                onPress={() => setConfirmation({ kind: "restore", workspace })}
              >
                <ArrowRotateLeft aria-hidden="true" />
              </Button>
            ) : null}
            {!workspace.isOwned ? (
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t("Leave {name}", { name: workspace.name })}
                onPress={() => setConfirmation({ kind: "leave", workspace })}
              >
                <ArrowRightFromSquare aria-hidden="true" />
              </Button>
            ) : null}
          </Toolbar>
        </Table.Cell>
      </Table.Row>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Workspaces")}
        description={t("Create company workspaces or open one shared with you.")}
        actions={
          <Button onPress={openCreate}>
            <Plus aria-hidden="true" />
            {t("New company workspace")}
          </Button>
        }
      />

      {pageError ? (
        <FormAlert
          title={t("We couldn't complete that workspace action")}
          description={pageError}
        />
      ) : null}

      {workspaces.length > 0 ? (
        <section aria-label={t("Workspace list")}>
          <DataTable label={t("Workspaces")} minWidth="min-w-[760px]">
            <Table.Header>
              <Table.Column isRowHeader>{t("Workspace")}</Table.Column>
              <Table.Column>{t("Owner")}</Table.Column>
              <Table.Column>{t("Role")}</Table.Column>
              <Table.Column>{t("Status")}</Table.Column>
              <Table.Column aria-label={t("Actions")}>{""}</Table.Column>
            </Table.Header>
            <Table.Body>{[...owned, ...shared].map(renderWorkspaceRow)}</Table.Body>
          </DataTable>
        </section>
      ) : (
        <EmptyBlock
          icon={<Layers className="size-5" />}
          title={t("No workspaces yet")}
          description={t("Create a company workspace to keep projects, clients and time together.")}
          action={<Button onPress={openCreate}>{t("New company workspace")}</Button>}
        />
      )}

      <WorkspaceFormModal
        isOpen={createOpen}
        title={t("New workspace")}
        name={name}
        logoDataUrl={logoDataUrl}
        hourlyRate={hourlyRate}
        currency={currency}
        hourlyRateError={hourlyRateError}
        errorMessage={formError}
        inputRef={logoInputRef}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetForm();
        }}
        onNameChange={setName}
        onLogoChange={handleLogo}
        onRemoveLogo={() => setLogoDataUrl(null)}
        onHourlyRateChange={setHourlyRate}
        onCurrencyChange={setCurrency}
        onSubmit={submitCreate}
        submitLabel={t("Create company workspace")}
        isPending={createBusy}
        canEditDetails
      />

      <WorkspaceFormModal
        isOpen={Boolean(editWorkspace)}
        title={t("Edit workspace")}
        name={name}
        logoDataUrl={logoDataUrl}
        hourlyRate={hourlyRate}
        currency={currency}
        hourlyRateError={hourlyRateError}
        errorMessage={formError}
        inputRef={logoInputRef}
        onOpenChange={(open) => {
          if (!open) {
            setEditWorkspace(null);
            resetForm();
          }
        }}
        onNameChange={setName}
        onLogoChange={handleLogo}
        onRemoveLogo={() => setLogoDataUrl(null)}
        onHourlyRateChange={setHourlyRate}
        onCurrencyChange={setCurrency}
        onSubmit={submitEdit}
        submitLabel={t("Save changes")}
        canEditDetails={editWorkspace?.isOwned ?? false}
        workspaceSettings={{ weekStart }}
        onWeekStartChange={setWeekStart}
      />

      <Modal isOpen={Boolean(confirmation)} onOpenChange={(open) => !open && setConfirmation(null)}>
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <ModalLayout.Header>
                {confirmation?.kind === "archive"
                  ? t("Archive workspace?")
                  : confirmation?.kind === "restore"
                    ? t("Restore workspace?")
                    : t("Leave workspace?")}
              </ModalLayout.Header>
              <ModalLayout.Body>
                <Typography type="body-sm" color="muted">
                  {confirmation?.kind === "archive"
                    ? isArchivingCurrent
                      ? hasAnotherActiveWorkspace
                        ? t(
                            "Archiving the current workspace will switch you to the first available active workspace.",
                          )
                        : t("Keep at least one active workspace before archiving the current one.")
                      : t("Archived workspaces become read-only until the Owner restores them.")
                    : confirmation?.kind === "restore"
                      ? t("This workspace will become available for tracking again.")
                      : t(
                          "You will lose access to this workspace. Your tracked history stays intact.",
                        )}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button variant="tertiary" onPress={() => setConfirmation(null)}>
                  {t("Cancel")}
                </Button>
                <Button
                  variant={
                    confirmation?.kind === "leave"
                      ? "danger"
                      : confirmation?.kind === "archive"
                        ? "secondary"
                        : "primary"
                  }
                  isDisabled={isArchivingCurrent && !hasAnotherActiveWorkspace}
                  onPress={confirmWorkspaceAction}
                >
                  {confirmation?.kind === "archive" ? (
                    <Chip color="warning" size="sm" variant="tertiary" className="px-0 py-0">
                      {t("Archive")}
                    </Chip>
                  ) : confirmation?.kind === "restore" ? (
                    t("Restore")
                  ) : (
                    t("Leave")
                  )}
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal isOpen={switchOpen} onOpenChange={setSwitchOpen}>
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Pause timer before switching?")}</ModalLayout.Header>
              <ModalLayout.Body>
                <Typography type="body-sm" color="muted">
                  {t(
                    "Pause the active timer before opening another workspace. It will remain paused in its original workspace.",
                  )}
                </Typography>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button variant="tertiary" onPress={() => setSwitchOpen(false)}>
                  {t("Cancel")}
                </Button>
                <Button onPress={confirmSwitch}>{t("Pause and switch")}</Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}

function WorkspaceFormModal({
  isOpen,
  title,
  name,
  logoDataUrl,
  hourlyRate,
  currency,
  hourlyRateError,
  errorMessage,
  inputRef,
  onOpenChange,
  onNameChange,
  onLogoChange,
  onRemoveLogo,
  onHourlyRateChange,
  onCurrencyChange,
  onSubmit,
  submitLabel,
  isPending = false,
  canEditDetails,
  workspaceSettings,
  onWeekStartChange,
}: {
  isOpen: boolean;
  title: string;
  name: string;
  logoDataUrl: string | null;
  hourlyRate: string;
  currency: CurrencyCode;
  hourlyRateError: string | undefined;
  errorMessage: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onNameChange: (value: string) => void;
  onLogoChange: (file: File | undefined) => void;
  onRemoveLogo: () => void;
  onHourlyRateChange: (value: string) => void;
  onCurrencyChange: (value: CurrencyCode) => void;
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  isPending?: boolean;
  canEditDetails: boolean;
  workspaceSettings?: {
    weekStart: "monday" | "sunday";
  };
  onWeekStartChange?: (value: "monday" | "sunday") => void;
}) {
  const { t } = useI18n();
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <ModalLayout.Header>{title}</ModalLayout.Header>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
              className="min-h-0"
            >
              <ModalLayout.Body>
                {errorMessage ? (
                  <FormAlert
                    title={t("We couldn't save this workspace")}
                    description={errorMessage}
                  />
                ) : null}
                {canEditDetails ? (
                  <>
                    <TextField
                      isRequired
                      fullWidth
                      name="workspace-name"
                      value={name}
                      validate={(value) => (value.trim() ? null : t("Workspace name is required"))}
                      onChange={onNameChange}
                    >
                      <Label>{t("Name")}</Label>
                      <Input variant="secondary" placeholder={t("Workspace name")} />
                      <FieldError />
                    </TextField>
                    <div className="flex flex-col gap-2">
                      <Label>{t("Workspace logo")}</Label>
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar size="lg" aria-label={t("Workspace logo preview")}>
                          {logoDataUrl ? <Avatar.Image alt="" src={logoDataUrl} /> : null}
                          <Avatar.Fallback>
                            {initialsForWorkspace(name || t("Workspace"))}
                          </Avatar.Fallback>
                        </Avatar>
                        <div className="flex flex-wrap gap-2">
                          <input
                            ref={inputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              onLogoChange(file);
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onPress={() => inputRef.current?.click()}
                          >
                            <CloudArrowUpIn className="size-4" />
                            {t("Upload logo")}
                          </Button>
                          {logoDataUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="tertiary"
                              onPress={onRemoveLogo}
                            >
                              {t("Remove")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <Description className="text-xs">
                        {t("PNG, JPG or WebP up to 500 KB.")}
                      </Description>
                    </div>
                  </>
                ) : (
                  <Typography type="body-sm" weight="semibold">
                    {name}
                  </Typography>
                )}
                <div className="space-y-3">
                  <div>
                    <Typography type="body-sm" weight="semibold">
                      {t("Billing rate")}
                    </Typography>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ModalSelect
                      label={t("Currency")}
                      buttonAriaLabel={t("Choose currency")}
                      value={currency}
                      options={currencyOptions.map((option) => ({ id: option, label: option }))}
                      onChange={(value) => onCurrencyChange(value as CurrencyCode)}
                    />
                    <TextField
                      isRequired
                      fullWidth
                      name="hourly-rate"
                      value={hourlyRate}
                      isInvalid={Boolean(hourlyRateError)}
                      onChange={onHourlyRateChange}
                    >
                      <Label>{t("Hourly rate")}</Label>
                      <Input variant="secondary" inputMode="decimal" placeholder="0.00" />
                      <FieldError>{hourlyRateError}</FieldError>
                    </TextField>
                  </div>
                </div>
                {canEditDetails && workspaceSettings ? (
                  <ModalSelect
                    label={t("Week starts on")}
                    buttonAriaLabel={t("Choose week start day")}
                    value={workspaceSettings.weekStart}
                    options={(["monday", "sunday"] as const).map((day) => ({
                      id: day,
                      label: t(day === "monday" ? "Monday" : "Sunday"),
                    }))}
                    onChange={(value) => onWeekStartChange?.(value as "monday" | "sunday")}
                  />
                ) : null}
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button type="button" variant="tertiary" onPress={() => onOpenChange(false)}>
                  {t("Cancel")}
                </Button>
                <Button
                  type="submit"
                  isPending={isPending}
                  isDisabled={
                    isPending || (canEditDetails && !name.trim()) || Boolean(hourlyRateError)
                  }
                >
                  {submitLabel}
                </Button>
              </ModalLayout.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
