import { Button } from "@heroui/react/button";
import { ArrowLeft, Check } from "@gravity-ui/icons";
import { Form } from "@heroui/react/form";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AuthDivider,
  AuthError,
  AuthField,
  AuthFooter,
  AuthPage,
  GoogleAuthButton,
} from "@/components/auth-page";
import { passwordRequirements } from "@/lib/password-policy";
import { ConfirmationEmail } from "@/components/confirmation-email";
import { signInWithGoogle, signUpWithPassword } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { isTurnstileConfigured, TurnstileChallenge } from "@/components/turnstile";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (session) window.location.replace(getAuthReturnPath());
  }, [session]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestInFlight.current || (isTurnstileConfigured && !captchaToken)) return;
    setError(null);
    const normalizedFirstName = firstName.trim().replace(/\s+/g, " ");
    const normalizedLastName = lastName.trim().replace(/\s+/g, " ");
    if (!normalizedFirstName) {
      setError("A first name is required.");
      return;
    }
    if (!normalizedLastName) {
      setError("A last name is required.");
      return;
    }
    if (`${normalizedFirstName} ${normalizedLastName}`.length > 120) {
      setError("Name must be 120 characters or fewer.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address");
      return;
    }
    const unmetRequirement = passwordRequirements.find(
      (requirement) => !requirement.meets(password),
    );
    if (unmetRequirement) {
      setError(unmetRequirement.error);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    requestInFlight.current = true;
    setBusy(true);
    try {
      const result = await signUpWithPassword(
        normalizedEmail,
        password,
        normalizedFirstName,
        normalizedLastName,
        captchaToken ?? undefined,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubmittedEmail(normalizedEmail);
      setPassword("");
      setConfirmation("");
      if (result.data) {
        window.location.replace(getAuthReturnPath());
        return;
      }
      setCreated(true);
    } catch {
      setError("Unable to create your account. Please try again.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
      setCaptchaToken(null);
      setCaptchaResetKey((value) => value + 1);
    }
  };

  const continueWithGoogle = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success) setError(result.error);
    } catch {
      setError("Unable to sign in.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthPage
      title={t("Create your account")}
      description={t("Create an account to join your company or start a new workspace.")}
    >
      <AuthError message={error} />
      {created ? (
        <div className="space-y-4" role="status">
          <ConfirmationEmail initialEmail={submittedEmail} justRequested />
          <Button
            className="w-full"
            onPress={() =>
              window.location.assign(`/login?redirect=${encodeURIComponent(getAuthReturnPath())}`)
            }
          >
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            {t("Back to sign in")}
          </Button>
        </div>
      ) : (
        <>
          <GoogleAuthButton onPress={continueWithGoogle} isDisabled={busy} />
          <AuthDivider />
          <Form className="flex flex-col gap-5" onSubmit={submit}>
            <div className="flex flex-col gap-5 sm:flex-row sm:gap-4">
              <AuthField
                id="signup-first-name"
                label={t("First name")}
                value={firstName}
                onChange={(value) => {
                  setFirstName(value);
                  setError(null);
                }}
                autoComplete="given-name"
                placeholder={t("Your first name")}
                validate={(value) => (value.trim() ? null : t("A first name is required."))}
              />
              <AuthField
                id="signup-last-name"
                label={t("Last name")}
                value={lastName}
                onChange={(value) => {
                  setLastName(value);
                  setError(null);
                }}
                autoComplete="family-name"
                placeholder={t("Your last name")}
                validate={(value) => (value.trim() ? null : t("A last name is required."))}
              />
            </div>
            <AuthField
              id="signup-email"
              label={t("Email")}
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                setError(null);
              }}
              autoComplete="email"
              placeholder="john@example.com"
              validate={(value) => {
                if (!value.trim()) return t("Email is required");
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
                  ? null
                  : t("Enter a valid email address");
              }}
            />
            <AuthField
              id="signup-password"
              allowPasswordToggle
              label={t("Password")}
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError(null);
              }}
              autoComplete="new-password"
              placeholder={t("Enter your password")}
              minLength={8}
              description={
                <span
                  className="mt-1 block space-y-1.5"
                  role="list"
                  aria-label={t("Password requirements")}
                >
                  {passwordRequirements.map((requirement) => {
                    const met = requirement.meets(password);
                    return (
                      <span
                        key={requirement.label}
                        role="listitem"
                        className={`flex items-center gap-2 ${met ? "text-success" : "text-muted"}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${met ? "border-success bg-success/10" : "border-current"}`}
                        >
                          {met ? <Check className="size-3" /> : null}
                        </span>
                        <span className="sr-only">
                          {t(met ? "Requirement met" : "Requirement not met")}:{" "}
                        </span>
                        {t(requirement.label)}
                      </span>
                    );
                  })}
                </span>
              }
              validate={(value) => {
                const unmet = passwordRequirements.find((requirement) => !requirement.meets(value));
                return unmet ? t(unmet.error) : null;
              }}
            />
            <AuthField
              id="signup-confirmation"
              allowPasswordToggle
              label={t("Confirm password")}
              type="password"
              value={confirmation}
              onChange={(value) => {
                setConfirmation(value);
                setError(null);
              }}
              autoComplete="new-password"
              placeholder={t("Confirm your password")}
              validate={(value) => (value === password ? null : t("Passwords do not match."))}
            />
            {isTurnstileConfigured ? (
              <TurnstileChallenge onToken={setCaptchaToken} resetKey={captchaResetKey} />
            ) : null}
            <Button
              className="w-full"
              type="submit"
              isDisabled={busy || (isTurnstileConfigured && !captchaToken)}
            >
              {busy ? t("Creating account…") : t("Create account")}
            </Button>
          </Form>
          <AuthFooter prompt={t("Already have an account?")} to="/login" action={t("Sign in")} />
        </>
      )}
    </AuthPage>
  );
}
