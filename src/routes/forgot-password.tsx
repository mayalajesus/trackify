import { Button } from "@heroui/react/button";
import { Form } from "@heroui/react/form";
import { Typography } from "@heroui/react/typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "@gravity-ui/icons";
import { AuthField, AuthFooter, AuthPage } from "@/components/auth-page";
import { FormAlert } from "@/components/form-feedback";
import { requestPasswordReset } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { isTurnstileConfigured, TurnstileChallenge } from "@/components/turnstile";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const { t, error: translateError } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const requestInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (!retryAt) return;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (!remaining) window.clearInterval(interval);
    };
    const interval = window.setInterval(updateCountdown, 1000);
    updateCountdown();
    return () => window.clearInterval(interval);
  }, [retryAt]);

  const sendResetEmail = async (address: string) => {
    if (requestInFlight.current || Date.now() < retryAt || (isTurnstileConfigured && !captchaToken))
      return;
    const normalizedEmail = address.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address");
      return;
    }
    requestInFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await requestPasswordReset(normalizedEmail, captchaToken ?? undefined);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSentEmail(normalizedEmail);
      setSecondsRemaining(60);
      setRetryAt(Date.now() + 60_000);
    } catch {
      setError("We couldn't send the reset email. Please try again.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
      if (isTurnstileConfigured) {
        setCaptchaToken(null);
        setCaptchaResetKey((value) => value + 1);
      }
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendResetEmail(email);
  };
  const sendDisabled = busy || secondsRemaining > 0 || (isTurnstileConfigured && !captchaToken);

  return (
    <AuthPage
      title={t("Reset your password")}
      description={t("We will send a secure reset link to your email.")}
    >
      {error ? (
        <FormAlert
          title={t("We couldn't send the reset email")}
          description={translateError(error)}
        />
      ) : null}
      {sentEmail ? (
        <div className="flex flex-col gap-5">
          <div className="space-y-3 text-center" role="status">
            <span
              className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success"
              aria-hidden="true"
            >
              <Check className="size-6" />
            </span>
            <Typography type="body-sm" color="muted" align="center">
              {t("If an account is associated with")}{" "}
              <strong className="break-words text-foreground">{sentEmail}</strong>
              {t(", you will receive a link to reset your password.")}
            </Typography>
          </div>
          {isTurnstileConfigured ? (
            <TurnstileChallenge onToken={setCaptchaToken} resetKey={captchaResetKey} />
          ) : null}
          <Button
            className="w-full"
            onPress={() => void sendResetEmail(sentEmail)}
            isDisabled={sendDisabled}
          >
            {busy
              ? t("Sending…")
              : secondsRemaining > 0
                ? t("Resend in {seconds}s", { seconds: secondsRemaining })
                : t("Resend email")}
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            isDisabled={busy}
            onPress={() => {
              setEmail(sentEmail);
              setSentEmail(null);
              setError(null);
              setCaptchaToken(null);
              setCaptchaResetKey((value) => value + 1);
            }}
          >
            {t("Correct email")}
          </Button>
          <Button className="w-full" variant="ghost" onPress={() => navigate({ to: "/login" })}>
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            {t("Back to sign in")}
          </Button>
        </div>
      ) : (
        <Form className="flex flex-col gap-5" onSubmit={submit}>
          <AuthField
            id="reset-email"
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
          {isTurnstileConfigured ? (
            <TurnstileChallenge onToken={setCaptchaToken} resetKey={captchaResetKey} />
          ) : null}
          <Button className="w-full" type="submit" isDisabled={sendDisabled}>
            {busy
              ? t("Sending…")
              : secondsRemaining > 0
                ? t("Resend in {seconds}s", { seconds: secondsRemaining })
                : t("Send reset link")}
          </Button>
          <AuthFooter prompt={t("Remember your password?")} to="/login" action={t("Sign in")} />
        </Form>
      )}
    </AuthPage>
  );
}
