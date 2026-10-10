import { Button } from "@heroui/react/button";
import { ArrowLeft } from "@gravity-ui/icons";
import { Spinner } from "@heroui/react/spinner";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthPage } from "@/components/auth-page";
import { ConfirmationEmail } from "@/components/confirmation-email";
import { RecoveryPasswordForm } from "@/components/recovery-password-form";
import { useAuth } from "@/lib/auth-context";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { useI18n } from "@/lib/i18n";
import { authProvider } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({ component: AuthCallbackPage });

function AuthCallbackPage() {
  const { session, loading, callbackError } = useAuth();
  const { t } = useI18n();
  const recovery = new URLSearchParams(window.location.search).get("mode") === "recovery";
  const [recoveryToken] = useState(() =>
    authProvider === "neon" && recovery
      ? new URLSearchParams(window.location.search).get("token")
      : null,
  );
  useEffect(() => {
    if (!recoveryToken) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [recoveryToken]);
  useEffect(() => {
    if (!loading && session && !callbackError && !recovery)
      window.location.replace(getAuthReturnPath());
  }, [loading, session, callbackError, recovery]);

  if (!loading && (callbackError || (!session && !recoveryToken))) {
    return (
      <AuthPage
        title={t(
          authProvider === "neon" && !callbackError && !recovery
            ? "Sign in"
            : "This link could not be used",
        )}
        description={t(
          recovery
            ? "The recovery link may have expired or already been used. Request a new password reset email."
            : authProvider === "neon" && !callbackError
              ? "Sign in to continue. If confirmation is still required, request another email."
              : "The link may have expired or already been used. Sign in if you have already confirmed your email, or request another link.",
        )}
      >
        {recovery ? (
          <Button className="w-full" onPress={() => window.location.replace("/forgot-password")}>
            {t("Send reset link")}
          </Button>
        ) : (
          <ConfirmationEmail />
        )}
        <Button
          variant="ghost"
          className="w-full"
          onPress={() =>
            window.location.replace("/login?redirect=" + encodeURIComponent(getAuthReturnPath()))
          }
        >
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          {t("Back to sign in")}
        </Button>
      </AuthPage>
    );
  }
  if (!loading && (session || recoveryToken) && recovery) {
    return (
      <AuthPage
        title={t("Reset your password")}
        description={t("Choose a new password to continue.")}
      >
        <RecoveryPasswordForm {...(recoveryToken ? { recoveryToken } : {})} />
      </AuthPage>
    );
  }
  return (
    <AuthPage title={t("Finishing sign in")} description={t("Preparing your workspace securely.")}>
      <div
        className="flex flex-col items-center gap-3 py-6 text-center"
        role="status"
        aria-live="polite"
      >
        <Spinner aria-label={t("Loading data")} />
        <Typography type="body-sm" color="muted">
          {t("Finishing sign in")}
        </Typography>
      </div>
    </AuthPage>
  );
}
