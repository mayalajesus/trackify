import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Description } from "@heroui/react/description";
import { FieldError } from "@heroui/react/field-error";
import { Input } from "@heroui/react/input";
import { InputGroup } from "@heroui/react/input-group";
import { Eye, EyeSlash } from "@gravity-ui/icons";
import { Label } from "@heroui/react/label";
import { Separator } from "@heroui/react/separator";
import { TextField } from "@heroui/react/textfield";
import { Typography } from "@heroui/react/typography";
import { useState, type ReactNode } from "react";
import { FormAlert } from "@/components/form-feedback";
import { RouterLink } from "@/components/router-link";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { useI18n } from "@/lib/i18n";

export function AuthPage({
  title,
  description,
  children,
  variant = "default",
}: {
  variant?: "default" | "login" | "signup" | "reset" | "confirmation";
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main data-page="auth" className={`auth-page auth-page--${variant}`}>
      <Card className="auth-card">
        <div className="auth-header">
          <Typography type="h1" className="auth-title" align="center">
            {title}
          </Typography>
          <Typography type="body-sm" color="muted" align="center" className="auth-description">
            {description}
          </Typography>
        </div>
        <div className="auth-content">{children}</div>
        <Typography type="body-xs" color="muted" align="center" className="auth-legal-links">
          <RouterLink to="/terms">Termos de Uso</RouterLink>
          {" · "}
          <RouterLink to="/privacy">Aviso de Privacidade</RouterLink>
        </Typography>
      </Card>
    </main>
  );
}

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  description,
  validate,
  minLength,
  required = true,
  allowPasswordToggle = false,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  description?: ReactNode;
  validate?: (value: string) => string | null;
  minLength?: number;
  required?: boolean;
  allowPasswordToggle?: boolean;
}) {
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const hasPasswordToggle = type === "password" && allowPasswordToggle;
  return (
    <TextField
      className="auth-field"
      fullWidth
      isRequired={required}
      name={id}
      type={hasPasswordToggle && passwordVisible ? "text" : type}
      value={value}
      {...(minLength === undefined ? {} : { minLength })}
      {...(validate === undefined ? {} : { validate })}
      onChange={onChange}
    >
      <Label>{label}</Label>
      {hasPasswordToggle ? (
        <InputGroup>
          <InputGroup.Input
            {...(autoComplete === undefined ? {} : { autoComplete })}
            {...(placeholder === undefined ? {} : { placeholder })}
          />
          <InputGroup.Suffix>
            <Button
              type="button"
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t(passwordVisible ? "Hide password" : "Show password")}
              aria-pressed={passwordVisible}
              onPress={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? (
                <EyeSlash aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </Button>
          </InputGroup.Suffix>
        </InputGroup>
      ) : (
        <Input
          {...(autoComplete === undefined ? {} : { autoComplete })}
          {...(placeholder === undefined ? {} : { placeholder })}
        />
      )}
      {description ? <Description>{description}</Description> : null}
      <FieldError />
    </TextField>
  );
}

export function AuthError({ message }: { message: string | null }) {
  const { t, error } = useI18n();
  return message ? (
    <FormAlert title={t("We couldn't sign you in")} description={error(message)} />
  ) : null;
}

export function AuthFooter({
  prompt,
  to,
  action,
}: {
  prompt: string;
  to: "/login" | "/signup" | "/forgot-password";
  action: string;
}) {
  return (
    <Typography type="body-sm" color="muted" align="center" className="auth-footer">
      {prompt}{" "}
      <RouterLink to={to} search={{ redirect: getAuthReturnPath() }}>
        {action}
      </RouterLink>
    </Typography>
  );
}

export function ContinueToWorkspaceButton() {
  const { t } = useI18n();
  return (
    <Button className="w-full" onPress={() => (window.location.href = "/tracker")}>
      {t("Continue")}
    </Button>
  );
}

export function GoogleAuthButton({
  onPress,
  isDisabled = false,
}: {
  onPress: () => void | Promise<void>;
  isDisabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Button
      className="auth-google w-full"
      variant="secondary"
      type="button"
      isDisabled={isDisabled}
      onPress={onPress}
    >
      <GoogleMark />
      {t("Continue with Google")}
    </Button>
  );
}

export function AuthDivider() {
  const { t } = useI18n();
  return (
    <div className="auth-divider flex items-center gap-3" aria-hidden="true">
      <Separator className="flex-1" />
      <Typography type="body-xs" color="muted">
        {t("or")}
      </Typography>
      <Separator className="flex-1" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.73-.06-1.44-.2-2.12H12v4.01h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.69 2.91-4.18 2.91-7.27Z"
      />
      <path
        fill="#34A853"
        d="M12 21.99c2.63 0 4.84-.87 6.45-2.45l-3.14-2.44c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.52A9.74 9.74 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.54 13.99A5.86 5.86 0 0 1 6.23 12c0-.69.12-1.36.31-1.99V7.49H3.3A9.98 9.98 0 0 0 2.25 12c0 1.62.39 3.15 1.05 4.51l3.24-2.52Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.04 14.63 2 12 2a9.74 9.74 0 0 0-8.7 5.49l3.24 2.52C7.31 7.7 9.46 5.98 12 5.98Z"
      />
    </svg>
  );
}
