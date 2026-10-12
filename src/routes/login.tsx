import { Button } from "@heroui/react/button";
import { ArrowLeft } from "@gravity-ui/icons";
import { Checkbox } from "@heroui/react/checkbox";
import { Label } from "@heroui/react/label";
import { Form } from "@heroui/react/form";
import { Link } from "@heroui/react/link";
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
import { ConfirmationEmail } from "@/components/confirmation-email";
import { signInWithGoogle, signInWithPassword } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { isTurnstileConfigured, TurnstileChallenge } from "@/components/turnstile";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const requestInFlight = useRef(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (session) window.location.replace(getAuthReturnPath());
  }, [session]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestInFlight.current || (isTurnstileConfigured && !captchaToken)) return;
    requestInFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await signInWithPassword(
        email.trim().toLowerCase(),
        password,
        captchaToken ?? undefined,
        rememberMe,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.location.replace(getAuthReturnPath());
    } catch {
      setError("Unable to sign in.");
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
      variant="login"
      title={t("Sign in")}
      description={t("Access your time tracking workspace.")}
    >
      <AuthError message={error} />
      {showConfirmation ? (
        <>
          <ConfirmationEmail initialEmail={email} />
          <Button variant="ghost" className="w-full" onPress={() => setShowConfirmation(false)}>
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            {t("Back to sign in")}
          </Button>
        </>
      ) : (
        <>
          <GoogleAuthButton onPress={continueWithGoogle} isDisabled={busy} />
          <AuthDivider />
          <Form className="auth-form auth-login-form" onSubmit={submit}>
            <AuthField
              id="login-email"
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
              id="login-password"
              allowPasswordToggle
              label={t("Password")}
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError(null);
              }}
              autoComplete="current-password"
              placeholder={t("Enter your password")}
              validate={(value) => (value ? null : t("Password is required"))}
            />
            <div className="auth-login-options flex flex-wrap items-center justify-between gap-3">
              <Checkbox
                name="remember-me"
                isSelected={rememberMe}
                onChange={setRememberMe}
                isDisabled={busy}
              >
                <Checkbox.Content className="items-center gap-2">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Label>{t("Remember me")}</Label>
                </Checkbox.Content>
              </Checkbox>
              <Link href="/forgot-password">{t("Forgot password?")}</Link>
            </div>
            {isTurnstileConfigured ? (
              <TurnstileChallenge onToken={setCaptchaToken} resetKey={captchaResetKey} />
            ) : null}
            <Button
              className="w-full"
              type="submit"
              isDisabled={busy || (isTurnstileConfigured && !captchaToken)}
            >
              {busy ? t("Signing in…") : t("Sign in")}
            </Button>
          </Form>
          {error ? (
            <Button
              variant="ghost"
              className="w-full"
              isDisabled={busy}
              onPress={() => {
                setError(null);
                setShowConfirmation(true);
              }}
            >
              {t("Didn't receive the confirmation email?")}
            </Button>
          ) : null}
        </>
      )}
      <AuthFooter prompt={t("Don't have an account?")} to="/signup" action={t("Create account")} />
    </AuthPage>
  );
}
