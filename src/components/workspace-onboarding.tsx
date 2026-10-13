import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Description } from "@heroui/react/description";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@/lib/toast";
import { Typography } from "@heroui/react/typography";
import { ArrowRightFromSquare, CloudArrowUpIn, Layers } from "@gravity-ui/icons";
import { useRef, useState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { ModalSelect } from "@/components/modal-select";
import {
  currencyOptions,
  defaultCurrencyForLocale,
  parseHourlyRateInput,
  type CurrencyCode,
} from "@/lib/billing";
import { signOut as signOutRemote } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

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

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "W"
  );
}

export function WorkspaceOnboarding() {
  const { configured } = useAuth();
  const { createWorkspace, signOut } = useStore();
  const { locale, t, error } = useI18n();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrencyForLocale(locale));
  const [hourlyRate, setHourlyRate] = useState("0.00");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const parsedHourlyRate = parseHourlyRateInput(hourlyRate);
  const hourlyRateError = !hourlyRate.trim()
    ? t("Hourly rate is required.")
    : hourlyRate.trim().startsWith("-")
      ? t("Hourly rate must be zero or greater.")
      : parsedHourlyRate === null
        ? t("Enter a valid hourly rate with up to two decimal places.")
        : undefined;

  const handleLogo = (file: File | undefined) => {
    if (!file) return;
    void readLogo(file)
      .then((value) => {
        setLogoDataUrl(value);
        setFormError(null);
      })
      .catch((reason: Error) => {
        setFormError(
          reason.message === "type"
            ? t("Choose a PNG, JPG or WebP logo.")
            : reason.message === "size"
              ? t("Workspace logos must be smaller than 500 KB.")
              : t("The workspace logo couldn't be read. Try another image."),
        );
      });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (parsedHourlyRate === null) return;
    setBusy(true);
    setFormError(null);
    const result = await createWorkspace(
      name,
      { hourlyRate: parsedHourlyRate, currency },
      logoDataUrl,
    );
    setBusy(false);
    if (!result.success) {
      setFormError(error(result.error));
      return;
    }
    toast.success(t("Workspace created"), { description: name.trim() });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const result = configured ? await signOutRemote() : signOut();
    if (!result.success) {
      setSigningOut(false);
      setFormError(error(result.error));
      return;
    }
    window.location.replace("/login");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-xl">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
            <Layers aria-hidden="true" className="size-5" />
          </span>
          <Typography type="h1" weight="semibold">
            {t("Create your company workspace")}
          </Typography>
          <Typography type="body-sm" color="muted" className="mx-auto mt-2 max-w-md">
            {t(
              "If your company invited you, open the original invitation link. Otherwise, create a company workspace to get started.",
            )}
          </Typography>
        </div>

        <Card className="p-5 sm:p-6">
          <Form className="space-y-5" onSubmit={submit}>
            {formError ? (
              <FormAlert title={t("We couldn't save this workspace")} description={formError} />
            ) : null}
            <TextField
              isRequired
              fullWidth
              name="workspace-name"
              value={name}
              validate={(value) => (value.trim() ? null : t("Workspace name is required"))}
              onChange={(value) => {
                setName(value);
                setFormError(null);
              }}
            >
              <Label>{t("Company workspace name")}</Label>
              <Input variant="secondary" placeholder={t("Workspace name")} />
              <FieldError />
            </TextField>

            <div className="flex flex-col gap-2">
              <Label>{t("Workspace logo")}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar size="lg" aria-label={t("Workspace logo preview")}>
                  {logoDataUrl ? <Avatar.Image alt="" src={logoDataUrl} /> : null}
                  <Avatar.Fallback>{initials(name)}</Avatar.Fallback>
                </Avatar>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      handleLogo(file);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onPress={() => logoInputRef.current?.click()}
                  >
                    <CloudArrowUpIn aria-hidden="true" className="size-4" />
                    {t("Upload logo")}
                  </Button>
                  {logoDataUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      onPress={() => setLogoDataUrl(null)}
                    >
                      {t("Remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
              <Description>{t("PNG, JPG or WebP up to 500 KB.")}</Description>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ModalSelect
                label={t("Currency")}
                buttonAriaLabel={t("Choose currency")}
                value={currency}
                options={currencyOptions.map((option) => ({ id: option, label: option }))}
                onChange={(value) => setCurrency(value as CurrencyCode)}
              />
              <TextField
                isRequired
                fullWidth
                name="hourly-rate"
                value={hourlyRate}
                isInvalid={Boolean(hourlyRateError)}
                onChange={setHourlyRate}
              >
                <Label>{t("Hourly rate")}</Label>
                <Input variant="secondary" inputMode="decimal" placeholder="0.00" />
                <FieldError>{hourlyRateError}</FieldError>
              </TextField>
            </div>

            <Button
              className="w-full"
              type="submit"
              isPending={busy}
              isDisabled={busy || !name.trim() || Boolean(hourlyRateError)}
            >
              {t("Create company workspace")}
            </Button>
          </Form>
        </Card>

        <Button
          className="mx-auto mt-4"
          variant="ghost"
          isPending={signingOut}
          onPress={() => void handleSignOut()}
        >
          <ArrowRightFromSquare aria-hidden="true" className="size-4" />
          {t("Sign out")}
        </Button>
      </section>
    </main>
  );
}
