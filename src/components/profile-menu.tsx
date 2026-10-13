import { Dropdown } from "@heroui/react/dropdown";
import { Label } from "@heroui/react/label";
import { Separator } from "@heroui/react/separator";
import { ThemeTabs } from "@/components/theme-tabs";
import { toast } from "@/lib/toast";
import { Typography } from "@heroui/react/typography";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRightFromSquare, Gear } from "@gravity-ui/icons";
import { useState } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useI18n } from "@/lib/i18n";
import { useStore, type ThemeMode } from "@/lib/store";
import { signOut as signOutRemote } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { resetSessionDefaultAvatar } from "@/lib/default-avatar";

export function ProfileMenu({
  showName = false,
  placement,
}: {
  showName?: boolean;
  placement?: "top start" | "right" | "bottom";
}) {
  const { currentMember, preferences, saveUserPreferences, signOut } = useStore();
  const { configured } = useAuth();
  const { t, error } = useI18n();
  const navigate = useNavigate();
  const [themeSaving, setThemeSaving] = useState(false);

  if (!currentMember) return null;

  const handleThemeChange = async (theme: ThemeMode) => {
    if (themeSaving || theme === preferences.theme) return;

    setThemeSaving(true);
    const result = await saveUserPreferences({ theme });
    setThemeSaving(false);
    if (!result.success) {
      toast.danger(t("We couldn't save your preferences"), {
        description: error(result.error),
      });
      return;
    }

    toast.success(t("Your preferences are up to date"));
  };

  const handleAction = async (key: string) => {
    switch (key) {
      case "settings":
        navigate({ to: "/settings", hash: "account" });
        break;
      case "sign-out": {
        const result = configured ? await signOutRemote() : signOut();
        if (!result.success) {
          toast.danger(t("We couldn't sign you out: {error}", { error: error(result.error) }));
        } else {
          resetSessionDefaultAvatar();
          void navigate({ to: "/login", replace: true });
        }
        break;
      }
    }
  };

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={t("Open account menu for {name}", { name: currentMember.name })}
        className={
          showName
            ? "flex h-11 w-full min-w-0 items-center justify-start gap-3 px-2 py-2 text-left"
            : "flex h-10 w-10 min-w-10 items-center justify-center p-0"
        }
      >
        <ProfileAvatar member={currentMember} avatarUrl={preferences.avatarUrl} size="sm" />
        {showName ? (
          <span className="min-w-0 truncate">
            <Typography type="body-sm" weight="semibold" truncate>
              {currentMember.name}
            </Typography>
          </span>
        ) : null}
      </Dropdown.Trigger>
      <Dropdown.Popover
        placement={placement ?? (showName ? "right" : "bottom")}
        containerPadding={12}
        offset={8}
        shouldFlip
        className="profile-menu w-[257px] min-w-0 max-w-[calc(100dvw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-2"
      >
        <div className="space-y-0.5 px-2 py-1.5">
          <Typography type="body-sm" weight="semibold" truncate>
            {currentMember.name}
          </Typography>
          <Typography type="body-xs" color="muted" truncate>
            {currentMember.email}
          </Typography>
        </div>
        <Separator className="my-1" />
        <div className="px-2 py-1">
          <ThemeTabs
            icons
            value={preferences.theme}
            isDisabled={themeSaving}
            onChange={(theme) => void handleThemeChange(theme)}
          />
        </div>
        <Dropdown.Menu className="mt-1" onAction={(key) => handleAction(String(key))}>
          <Dropdown.Item id="settings">
            <Gear className="size-4" />
            <Label>{t("Settings")}</Label>
          </Dropdown.Item>
          <Dropdown.Item id="sign-out" variant="danger">
            <ArrowRightFromSquare className="size-4 text-danger" />
            <Label>{t("Sign out")}</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
