import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react/button";
import { Form } from "@heroui/react/form";
import { Typography } from "@heroui/react/typography";
import { AuthError, AuthField } from "./auth-page";
import { isTurnstileConfigured, TurnstileChallenge } from "./turnstile";
import { resendConfirmation } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// This only limits accidental repeated clicks. The auth provider enforces abuse limits.
const cooldownKey = "trackify:confirmation-retry-at";
export function ConfirmationEmail({
  initialEmail = "",
  justRequested = false,
}: {
  initialEmail?: string;
  justRequested?: boolean;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [sentEmail, setSentEmail] = useState(justRequested ? initialEmail : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const inFlight = useRef(false);
  const [retryAt, setRetryAt] = useState(() => {
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(cooldownKey)) || 0;
    } catch {
      /* Storage is optional. */
    }
    return Math.max(justRequested ? Date.now() + 60_000 : 0, Math.min(saved, Date.now() + 60_000));
  });
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)),
  );
  useEffect(() => {
    try {
      sessionStorage.setItem(cooldownKey, String(retryAt));
    } catch {
      /* Storage is optional. */
    }
    const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    setSeconds(remaining);
    if (!remaining) return;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSeconds(next);
      if (!next) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || Date.now() < retryAt || (isTurnstileConfigured && !token)) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setRetryAt(Date.now() + 60_000);
    try {
      const result = await resendConfirmation(address, token ?? undefined);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSentEmail(address);
    } catch {
      setError("Unable to request confirmation. Please try again later.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setToken(null);
      setResetKey((value) => value + 1);
    }
  };
  return (
    <Form className="flex flex-col gap-4" onSubmit={submit}>
      <AuthError message={error} />
      {sentEmail ? (
        <Typography type="body-sm" color="muted" role="status">
          {t("If confirmation is still required, check the inbox and spam folder for")}{" "}
          <strong className="break-words">{sentEmail}</strong>.
        </Typography>
      ) : null}
      <AuthField
        id="confirmation-email"
        label={t("Email")}
        type="email"
        value={email}
        onChange={(value) => {
          setEmail(value);
          setError(null);
        }}
        autoComplete="email"
      />
      {isTurnstileConfigured ? <TurnstileChallenge onToken={setToken} resetKey={resetKey} /> : null}
      <Button
        type="submit"
        className="w-full"
        isDisabled={busy || seconds > 0 || (isTurnstileConfigured && !token)}
      >
        {busy
          ? t("Sending…")
          : seconds > 0
            ? t("Resend in {seconds}s", { seconds })
            : t("Resend confirmation email")}
      </Button>
    </Form>
  );
}
