import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Spinner } from "@heroui/react/spinner";
import { Typography } from "@heroui/react/typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { WorkspaceOnboarding } from "@/components/workspace-onboarding";
import { createApiDataSource } from "@/lib/api-data-source";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";

export function WorkspaceAccessOnboarding() {
  const { configured, session } = useAuth();
  const { t, error } = useI18n();
  const [createOwnWorkspace, setCreateOwnWorkspace] = useState(false);
  const invitations = useQuery({
    queryKey: ["pending-workspace-invitations", session?.user.id],
    enabled: configured && Boolean(session),
    retry: false,
    queryFn: async () => {
      const result = await createApiDataSource().listPendingInvitations();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  if (!configured || createOwnWorkspace || invitations.data?.length === 0) {
    return <WorkspaceOnboarding />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md space-y-5 p-6">
        <Typography type="h1" weight="semibold">
          {t("Workspace invitations")}
        </Typography>
        {invitations.isPending ? (
          <Spinner role="status" aria-label={t("Loading invitations")} />
        ) : invitations.isError ? (
          <>
            <FormAlert
              title={t("We couldn't load your invitations")}
              description={error(invitations.error.message)}
            />
            <Button onPress={() => void invitations.refetch()}>{t("Try again")}</Button>
          </>
        ) : (
          <>
            <Typography type="body-sm" color="muted">
              {t("You can join an invited workspace without creating a new one.")}
            </Typography>
            <ul className="space-y-3">
              {invitations.data?.map((invitation) => (
                <li key={invitation.id} className="flex flex-col gap-2">
                  <Typography type="body-sm" weight="semibold">
                    {invitation.workspaceName}
                  </Typography>
                  <Button
                    onPress={() =>
                      window.location.assign(
                        `/invite/accept?invitation=${encodeURIComponent(invitation.id)}`,
                      )
                    }
                  >
                    {t("Join {workspace}", { workspace: invitation.workspaceName })}
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" onPress={() => setCreateOwnWorkspace(true)}>
              {t("Create my own workspace")}
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
