import { Card } from "@heroui/react/card";
import { Button } from "@heroui/react/button";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Select } from "@heroui/react/select";
import { Switch } from "@heroui/react/switch";
import { Tabs } from "@heroui/react/tabs";
import { TextField } from "@heroui/react/textfield";
import { Tooltip } from "@heroui/react/tooltip";
import { Modal } from "@heroui/react/modal";
import { Typography } from "@heroui/react/typography";
import { toast } from "@heroui/react/toast";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, CircleInfo } from "@gravity-ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { PageHeader } from "@/components/page-header";
import { localeOptions, translate, useI18n } from "@/lib/i18n";
import { ProfileAvatar } from "@/components/profile-avatar";
import {
  getGoogleProfileAvatarUrl,
  isUserUploadedAvatarUrl,
  prepareAvatarImage,
} from "@/lib/profile-image";
import { useStore, type ThemeMode } from "@/lib/store";
import { updateEmail, updatePassword } from "@/lib/auth";
import { passwordRequirements } from "@/lib/password-policy";
import { useAuth } from "@/lib/auth-context";
import { createApiDataSource } from "@/lib/api-data-source";
import { useAccountLifecycle } from "@/lib/account-lifecycle-context";
import { RouterLink } from "@/components/router-link";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Trackify" },
      { name: "description", content: "Account and personal preferences." },
      { property: "og:title", content: "Settings — Trackify" },
      { property: "og:description", content: "Configure your Trackify workspace." },
    ],
  }),
  component: SettingsPage,
});

function splitAccountName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

type AccountFormSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
};

function normalizeAccountNamePart(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeAccountEmail(value: string) {
  return value.trim().toLowerCase();
}

function SettingsPage() {
  const {
    preferences,
    currentMember,
    setUserPreferences,
    saveUserPreferences,
    updateCurrentMemberName,
    updateCurrentMemberEmail,
    members,
    currentWorkspace,
  } = useStore();
  const { configured, session } = useAuth();
  const dataSource = useMemo(() => createApiDataSource(), []);
  const lifecycle = useAccountLifecycle();
  const { t, error } = useI18n();
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [accountFirstName, setAccountFirstName] = useState(
    splitAccountName(currentMember?.name ?? "").firstName,
  );
  const [accountLastName, setAccountLastName] = useState(
    splitAccountName(currentMember?.name ?? "").lastName,
  );
  const [accountEmail, setAccountEmail] = useState(
    session?.user.email ?? currentMember?.email ?? "",
  );
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBaseline, setAccountBaseline] = useState<AccountFormSnapshot>(() => {
    const name = splitAccountName(currentMember?.name ?? "");
    return {
      ...name,
      email: session?.user.email ?? currentMember?.email ?? "",
    };
  });
  const [photoAction, setPhotoAction] = useState<"uploading" | "removing" | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const photoActionRef = useRef<"uploading" | "removing" | null>(null);
  const [privacyAction, setPrivacyAction] = useState<"export" | "delete" | "transfer" | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");

  useEffect(() => {
    const name = splitAccountName(currentMember?.name ?? "");
    setAccountFirstName(name.firstName);
    setAccountLastName(name.lastName);
    setAccountEmail(session?.user.email ?? currentMember?.email ?? "");
    setAccountBaseline({
      ...name,
      email: session?.user.email ?? currentMember?.email ?? "",
    });
    setPassword("");
    setPasswordConfirmation("");
    setAccountError(null);
  }, [currentMember?.id, currentMember?.name, currentMember?.email, session?.user.email]);

  const toggles = [
    {
      key: "idleDetection" as const,
      title: "Idle detection",
      hint: "Ask whether to pause the timer after long inactivity.",
    },
  ];

  const themeOptions: Array<{
    id: ThemeMode;
    label: string;
  }> = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  const savePreference = async (patch: Partial<typeof preferences>) => {
    const result = await saveUserPreferences(patch);
    if (!result.success) {
      setPreferenceError(result.error);
      return;
    }
    setPreferenceError(null);
    const locale = patch.language ?? preferences.language;
    toast.success(translate("Your preferences are up to date", locale));
  };

  const accountHasChanges =
    normalizeAccountNamePart(accountFirstName) !==
      normalizeAccountNamePart(accountBaseline.firstName) ||
    normalizeAccountNamePart(accountLastName) !==
      normalizeAccountNamePart(accountBaseline.lastName) ||
    normalizeAccountEmail(accountEmail) !== normalizeAccountEmail(accountBaseline.email) ||
    Boolean(password || passwordConfirmation);

  const savePhoto = async (file: File) => {
    if (photoActionRef.current) return;
    photoActionRef.current = "uploading";
    setPhotoAction("uploading");
    setAccountError(null);
    try {
      const avatarUrl = await prepareAvatarImage(file);
      if (configured && session) {
        const remote = await dataSource.uploadAvatar(avatarUrl);
        if (!remote.success) {
          setAccountError(remote.error);
          return;
        }
        const result = setUserPreferences({ avatarUrl: remote.data });
        if (!result.success) {
          setAccountError(result.error);
          return;
        }
      } else {
        const result = await saveUserPreferences({ avatarUrl });
        if (!result.success) {
          setAccountError(result.error);
          return;
        }
      }
      setAccountError(null);
      toast.success(t("Your profile photo is updated"));
    } catch (photoError) {
      const code = photoError instanceof Error ? photoError.message : "read";
      setAccountError(
        code === "type"
          ? "Choose a JPG, PNG, WebP or GIF image."
          : code === "size"
            ? "Profile photos must be smaller than 1 MB."
            : t("The profile photo couldn't be read. Try another image."),
      );
    } finally {
      photoActionRef.current = null;
      setPhotoAction(null);
    }
  };

  const removePhoto = async () => {
    if (photoActionRef.current || !isUserUploadedAvatarUrl(preferences.avatarUrl)) return;
    photoActionRef.current = "removing";
    setPhotoAction("removing");
    setAccountError(null);
    let storageWasRemoved = false;
    const fallbackAvatarUrl = getGoogleProfileAvatarUrl(session?.user.user_metadata);
    try {
      if (configured && session) {
        const remote = await dataSource.removeAvatar();
        if (!remote.success) {
          setAccountError(remote.error);
          return;
        }
        storageWasRemoved = true;
      }
      const result = await saveUserPreferences({ avatarUrl: fallbackAvatarUrl });
      if (!result.success) {
        if (storageWasRemoved) setUserPreferences({ avatarUrl: fallbackAvatarUrl });
        setAccountError(result.error);
        return;
      }
      setAccountError(null);
      toast.success(t("Your profile photo was removed"));
    } finally {
      photoActionRef.current = null;
      setPhotoAction(null);
    }
  };

  const saveAccount = async () => {
    if (!accountHasChanges) return;
    const firstName = accountFirstName.trim().replace(/\s+/g, " ");
    const lastName = accountLastName.trim().replace(/\s+/g, " ");
    if (!firstName) {
      setAccountError("A first name is required.");
      return;
    }
    if (!lastName) {
      setAccountError("A last name is required.");
      return;
    }
    const nextName = `${firstName} ${lastName}`;
    if (nextName.length > 120) {
      setAccountError("Name must be 120 characters or fewer.");
      return;
    }
    const unmetPasswordRequirement =
      password && passwordRequirements.find((rule) => !rule.meets(password));
    if (unmetPasswordRequirement) {
      setAccountError(unmetPasswordRequirement.error);
      return;
    }
    if (password !== passwordConfirmation) {
      setAccountError("Passwords do not match.");
      return;
    }

    if (configured) {
      if (session && nextName !== currentMember?.name) {
        const nameResult = await dataSource.updateProfileName(nextName);
        if (!nameResult.success) {
          setAccountError(nameResult.error);
          return;
        }
      }
      const nextEmail = accountEmail.trim();
      const currentEmail = session?.user.email ?? "";
      if (nextEmail && nextEmail !== currentEmail) {
        const emailResult = await updateEmail(nextEmail);
        if (!emailResult.success) {
          setAccountError(emailResult.error);
          return;
        }
      }
      if (password) {
        const passwordResult = await updatePassword(password);
        if (!passwordResult.success) {
          setAccountError(passwordResult.error);
          return;
        }
      }
    } else {
      const nameResult = updateCurrentMemberName(nextName);
      if (!nameResult.success) {
        setAccountError(nameResult.error);
        return;
      }
      const result = updateCurrentMemberEmail(accountEmail.trim() || currentMember?.email || "");
      if (!result.success) {
        setAccountError(result.error);
        return;
      }
    }
    if (configured && nextName !== currentMember?.name) {
      const nameResult = updateCurrentMemberName(nextName);
      if (!nameResult.success) {
        setAccountError(nameResult.error);
        return;
      }
    }
    setAccountError(null);
    setAccountBaseline({ firstName, lastName, email: accountEmail.trim() });
    setPassword("");
    setPasswordConfirmation("");
    toast.success(t("Your account is up to date"));
  };

  const exportData = async () => {
    setPrivacyAction("export");
    setPrivacyError(null);
    const result = await dataSource.exportAccountData();
    setPrivacyAction(null);
    if (!result.success) {
      setPrivacyError(result.error);
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trackify-account-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Seus dados foram exportados");
  };

  const transferOwnership = async () => {
    if (!currentWorkspace || !newOwnerId) return;
    setPrivacyAction("transfer");
    setPrivacyError(null);
    const result = await dataSource.transferWorkspaceOwnership(currentWorkspace.id, newOwnerId);
    setPrivacyAction(null);
    if (!result.success) {
      setPrivacyError(result.error);
      return;
    }
    toast.success("Propriedade transferida");
    window.location.reload();
  };

  const requestDeletion = async () => {
    setPrivacyAction("delete");
    setPrivacyError(null);
    const result = await dataSource.requestAccountDeletion(deletionConfirmation);
    setPrivacyAction(null);
    if (!result.success) {
      setPrivacyError(result.error);
      return;
    }
    await lifecycle.refresh();
    window.location.assign("/account-deletion");
  };

  if (!currentMember) {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader
          title={t("Settings")}
          description={t("Manage your account and personal preferences.")}
        />
        <FormAlert
          title={t("We couldn't load your account")}
          description={t("Your account details are unavailable right now. Try again shortly.")}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={t("Settings")}
        description={t("Manage your account and personal preferences.")}
      />

      <Card id="account" className="scroll-mt-24 space-y-4 p-4">
        <div className="space-y-1">
          <Typography type="h2" weight="semibold">
            {t("Account")}
          </Typography>
          <Typography type="body-sm" color="muted">
            {t("Manage your profile and account details.")}
          </Typography>
        </div>

        {accountError ? (
          <FormAlert title={t("We couldn't save your account")} description={error(accountError)} />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <ProfileAvatar member={currentMember} avatarUrl={preferences.avatarUrl} size="lg" />
          <div className="min-w-0">
            <input
              ref={avatarInputRef}
              accept="image/jpeg,image/png,image/webp,image/gif"
              aria-label={t("Change profile photo")}
              className="hidden"
              disabled={photoAction !== null}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void savePhoto(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                type="button"
                isDisabled={photoAction !== null}
                isPending={photoAction === "uploading"}
                onPress={() => avatarInputRef.current?.click()}
              >
                {t("Change profile photo")}
              </Button>
              {isUserUploadedAvatarUrl(preferences.avatarUrl) ? (
                <Button
                  size="sm"
                  type="button"
                  variant="tertiary"
                  isDisabled={photoAction !== null}
                  isPending={photoAction === "removing"}
                  onPress={() => void removePhoto()}
                >
                  {t("Remove profile photo")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <Form
          className="space-y-3 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAccount();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <TextField
              isRequired
              fullWidth
              className="min-w-0 flex-1"
              name="account-first-name"
              value={accountFirstName}
              validate={(value) => (value.trim() ? null : t("A first name is required."))}
              onChange={(value) => {
                setAccountFirstName(value);
                setAccountError(null);
              }}
            >
              <Label>{t("First name")}</Label>
              <Input variant="secondary" placeholder={t("Your first name")} maxLength={60} />
              <FieldError />
            </TextField>

            <TextField
              isRequired
              fullWidth
              className="min-w-0 flex-1"
              name="account-last-name"
              value={accountLastName}
              validate={(value) => (value.trim() ? null : t("A last name is required."))}
              onChange={(value) => {
                setAccountLastName(value);
                setAccountError(null);
              }}
            >
              <Label>{t("Last name")}</Label>
              <Input variant="secondary" placeholder={t("Your last name")} maxLength={60} />
              <FieldError />
            </TextField>
          </div>

          <TextField
            isRequired
            fullWidth
            name="account-email"
            type="email"
            value={accountEmail}
            validate={(value) =>
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : t("Enter a valid email address")
            }
            onChange={(value) => {
              setAccountEmail(value);
              setAccountError(null);
            }}
          >
            <Label>{t("Email")}</Label>
            <Input variant="secondary" placeholder="name@company.com" />
            <FieldError />
          </TextField>

          <TextField
            fullWidth
            name="account-password"
            type="password"
            value={password}
            validate={(value) => {
              const unmet = value && passwordRequirements.find((rule) => !rule.meets(value));
              return unmet ? t(unmet.error) : null;
            }}
            onChange={(value) => {
              setPassword(value);
              setAccountError(null);
            }}
          >
            <Label>{t("Password")}</Label>
            <Input
              variant="secondary"
              placeholder={t("Leave blank to keep your current password.")}
            />
            <FieldError />
          </TextField>

          <TextField
            fullWidth
            name="account-password-confirmation"
            type="password"
            value={passwordConfirmation}
            validate={(value) => (value !== password ? t("Passwords do not match.") : null)}
            onChange={(value) => {
              setPasswordConfirmation(value);
              setAccountError(null);
            }}
          >
            <Label>{t("Confirm password")}</Label>
            <Input variant="secondary" placeholder={t("Repeat your new password.")} />
            <FieldError />
          </TextField>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              isDisabled={!accountHasChanges || !(accountEmail || currentMember.email).trim()}
            >
              {t("Save account")}
            </Button>
          </div>
        </Form>
      </Card>

      <Card id="personal-preferences" className="scroll-mt-24 space-y-4 p-4">
        <Typography type="h2" weight="semibold">
          {t("Preferences")}
        </Typography>

        {preferenceError ? (
          <FormAlert
            title={t("We couldn't save your preferences")}
            description={error(preferenceError)}
          />
        ) : null}

        <Select
          fullWidth
          variant="secondary"
          selectedKey={preferences.language}
          onSelectionChange={(key) =>
            savePreference({ language: String(key) as typeof preferences.language })
          }
        >
          <Label>{t("Language")}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <ChevronDown aria-hidden="true" className="size-4" />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox aria-label={t("Language")}>
              {localeOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                  <Label>{option.label}</Label>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <div className="flex flex-col gap-1.5">
          <Label>{t("Theme")}</Label>
          <Tabs
            className="w-full"
            selectedKey={preferences.theme}
            onSelectionChange={(key) => savePreference({ theme: String(key) as ThemeMode })}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={t("Theme")} className="w-full">
                {themeOptions.map((option) => (
                  <Tabs.Tab key={option.id} id={option.id} className="flex-1">
                    {t(option.label)}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>

        <div className="space-y-3">
          {toggles.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <Switch
                className="shrink-0"
                aria-label={t(item.title)}
                isSelected={preferences[item.key]}
                onChange={(selected: boolean) =>
                  savePreference({ [item.key]: selected } as Partial<typeof preferences>)
                }
              >
                <Switch.Content className="flex min-w-0 items-center gap-2">
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Label>{t(item.title)}</Label>
                </Switch.Content>
              </Switch>
              <Tooltip delay={0} closeDelay={0} shouldSkipAnimation>
                <Tooltip.Trigger
                  aria-label={t("More information about {label}", { label: t(item.title) })}
                  className="inline-flex size-5 min-w-5 shrink-0 items-center justify-center text-muted"
                >
                  <CircleInfo aria-hidden="true" className="size-3.5" />
                </Tooltip.Trigger>
                <Tooltip.Content className="max-w-xs" showArrow>
                  {t(item.hint)}
                </Tooltip.Content>
              </Tooltip>
            </div>
          ))}
        </div>
      </Card>

      <Card id="privacy" className="scroll-mt-24 space-y-4 p-4">
        <div className="space-y-1">
          <Typography type="h2" weight="semibold">
            Privacidade e dados
          </Typography>
          <Typography type="body-sm" color="muted">
            Consulte os documentos vigentes, exporte seus dados ou encerre sua conta.
          </Typography>
        </div>

        {privacyError ? (
          <FormAlert title="Não foi possível concluir a ação" description={error(privacyError)} />
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <RouterLink to="/terms">Termos de Uso</RouterLink>
          <RouterLink to="/privacy">Aviso de Privacidade</RouterLink>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            isPending={privacyAction === "export"}
            onPress={() => void exportData()}
          >
            Exportar meus dados em JSON
          </Button>
          <Button
            variant="danger"
            isDisabled={Boolean(lifecycle.status?.ownershipBlockers.length)}
            onPress={() => {
              setPrivacyError(null);
              setDeletionConfirmation("");
              setDeletionOpen(true);
            }}
          >
            Excluir minha conta
          </Button>
        </div>

        {lifecycle.status?.ownershipBlockers.length ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <Typography type="body-sm" weight="semibold">
              Transfira os workspaces compartilhados antes de excluir sua conta
            </Typography>
            <Typography type="body-xs" color="muted">
              Pendentes:{" "}
              {lifecycle.status.ownershipBlockers.map((item) => item.workspaceName).join(", ")}.
              Abra cada workspace e escolha um membro ativo como novo proprietário.
            </Typography>
            {currentWorkspace &&
            lifecycle.status.ownershipBlockers.some(
              (item) => item.workspaceId === currentWorkspace.id,
            ) ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Select
                  fullWidth
                  variant="secondary"
                  selectedKey={newOwnerId || null}
                  onSelectionChange={(key) => setNewOwnerId(String(key))}
                >
                  <Label>Novo proprietário</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator>
                      <ChevronDown aria-hidden="true" className="size-4" />
                    </Select.Indicator>
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox aria-label="Novo proprietário">
                      {members
                        .filter(
                          (member) => member.status === "active" && member.id !== currentMember.id,
                        )
                        .map((member) => (
                          <ListBox.Item key={member.id} id={member.id} textValue={member.name}>
                            <Label>{member.name}</Label>
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <Button
                  className="sm:mb-px"
                  isDisabled={!newOwnerId}
                  isPending={privacyAction === "transfer"}
                  onPress={() => void transferOwnership()}
                >
                  Transferir propriedade
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Modal isOpen={deletionOpen} onOpenChange={setDeletionOpen}>
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <ModalLayout.Header>Excluir conta?</ModalLayout.Header>
              <ModalLayout.Body>
                {privacyError ? (
                  <FormAlert
                    title="Não foi possível agendar a exclusão"
                    description={error(privacyError)}
                  />
                ) : null}
                <Typography type="body-sm" color="muted">
                  O acesso será restrito imediatamente. Você terá 30 dias para cancelar; depois, a
                  exclusão será definitiva. Para confirmar, digite seu e-mail.
                </Typography>
                <TextField
                  fullWidth
                  name="deletion-confirmation"
                  value={deletionConfirmation}
                  onChange={(value) => {
                    setDeletionConfirmation(value);
                    setPrivacyError(null);
                  }}
                >
                  <Label>{accountEmail}</Label>
                  <Input variant="secondary" autoComplete="off" />
                </TextField>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" variant="secondary">
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  isDisabled={
                    deletionConfirmation.trim().toLowerCase() !== accountEmail.trim().toLowerCase()
                  }
                  isPending={privacyAction === "delete"}
                  onPress={() => void requestDeletion()}
                >
                  Agendar exclusão
                </Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
