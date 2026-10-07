import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Description } from "@heroui/react/description";
import { Drawer } from "@heroui/react/drawer";
import { Form } from "@heroui/react/form";
import { I18nProvider as HeroI18nProvider } from "@heroui/react/rac";
import { Input } from "@heroui/react/input";
import { Kbd } from "@heroui/react/kbd";
import { Label } from "@heroui/react/label";
import { Link } from "@heroui/react/link";
import { Dropdown } from "@heroui/react/dropdown";
import { ButtonGroup } from "@heroui/react/button-group";
import { Separator } from "@heroui/react/separator";
import { Spinner } from "@heroui/react/spinner";
import { Surface } from "@heroui/react/surface";
import { TextField } from "@heroui/react/textfield";
import { Typography } from "@heroui/react/typography";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Bars, ChevronDown, Clock, LayoutSideContentLeft } from "@gravity-ui/icons";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { CommandMenu } from "@/components/command-menu";
import { HeaderTimerControl } from "@/components/header-timer-control";
import { IdleDetectionPrompt } from "@/components/idle-detection-prompt";
import { LogTimeModal } from "@/components/log-time-modal";
import { ProfileMenu } from "@/components/profile-menu";
import { FormAlert } from "@/components/form-feedback";
import { WorkspaceOnboarding } from "@/components/workspace-onboarding";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { SidebarNavigation } from "@/components/layout/sidebar-navigation";
import { DrawerTriggerRegistration } from "@/components/overlay-trigger-registration";
import { AppI18nProvider, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { useAccountLifecycle } from "@/lib/account-lifecycle-context";

const publicAuthPaths = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/invite/accept",
  "/terms",
  "/privacy",
]);
const accountFlowPaths = new Set(["/legal-consent", "/account-deletion"]);
const legalDocumentPaths = new Set(["/terms", "/privacy"]);

export function AppShell({ children }: { children: ReactNode }) {
  const { preferences } = useStore();
  const { configured, loading: authLoading, session } = useAuth();
  const lifecycle = useAccountLifecycle();
  const currentLocation = useLocation();
  const navigate = useNavigate();
  const isPublicAuthPath = publicAuthPaths.has(currentLocation.pathname);
  const isAccountFlowPath = accountFlowPaths.has(currentLocation.pathname);
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const dark = preferences.theme === "dark" || (preferences.theme === "system" && systemDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
  }, [dark]);

  useEffect(() => {
    if (!configured || authLoading || session || isPublicAuthPath) return;
    void navigate({ to: "/login", replace: true });
  }, [authLoading, configured, isPublicAuthPath, navigate, session]);

  useEffect(() => {
    if (!configured || authLoading || !session || lifecycle.loading || !lifecycle.status) return;
    // Let the callback finish authentication or password recovery before routing
    // to consent. Otherwise competing redirects can interrupt those flows.
    if (currentLocation.pathname === "/auth/callback") return;
    if (lifecycle.status.accountStatus === "deletion_pending") {
      if (currentLocation.pathname !== "/account-deletion") {
        void navigate({ to: "/account-deletion", replace: true });
      }
      return;
    }
    if (!lifecycle.status.legal.accepted) {
      if (
        currentLocation.pathname !== "/legal-consent" &&
        !legalDocumentPaths.has(currentLocation.pathname)
      ) {
        const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(`/legal-consent?redirect=${encodeURIComponent(returnPath)}`);
      }
      return;
    }
    if (isAccountFlowPath) window.location.replace(getAuthReturnPath());
  }, [
    authLoading,
    configured,
    currentLocation.pathname,
    isAccountFlowPath,
    lifecycle.loading,
    lifecycle.status,
    navigate,
    session,
  ]);

  if (configured && (authLoading || (!session && !isPublicAuthPath))) {
    const loadingLabel = document.documentElement.lang === "pt-BR" ? "Carregando" : "Loading";
    return (
      <Surface
        variant="transparent"
        className="flex min-h-screen items-center justify-center bg-background p-4"
      >
        <Spinner role="status" aria-label={loadingLabel} />
      </Surface>
    );
  }

  if (configured && session && !isPublicAuthPath && lifecycle.loading) {
    return (
      <Surface
        variant="transparent"
        className="flex min-h-screen items-center justify-center bg-background p-4"
      >
        <Spinner role="status" aria-label="Carregando dados da conta" />
      </Surface>
    );
  }

  if (configured && session && !isPublicAuthPath && lifecycle.error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md p-6 text-center">
          <Typography type="h1" weight="semibold">
            Não foi possível verificar sua conta
          </Typography>
          <Typography type="body-sm" color="muted" className="mt-2">
            {lifecycle.error}
          </Typography>
          <Button className="mt-5" onPress={() => void lifecycle.refresh()}>
            Tentar novamente
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <Surface variant="transparent" className="min-h-screen bg-background">
      <AppI18nProvider locale={preferences.language}>
        <HeroI18nProvider locale={preferences.language}>
          {isPublicAuthPath || isAccountFlowPath ? children : <AppDataGate>{children}</AppDataGate>}
        </HeroI18nProvider>
      </AppI18nProvider>
    </Surface>
  );
}

function AppDataGate({ children }: { children: ReactNode }) {
  const { sessionStatus, accountLoading, accountError, retryAccountLoad, workspaces } = useStore();
  const { t, error } = useI18n();

  if (accountLoading) {
    return (
      <Surface
        variant="transparent"
        className="flex min-h-screen items-center justify-center bg-background p-4"
      >
        <Spinner role="status" aria-label={t("Loading data")} />
      </Surface>
    );
  }

  if (accountError) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md p-6 text-center">
          <Typography type="h1" weight="semibold">
            {t("We couldn't load your account")}
          </Typography>
          <Typography type="body-sm" color="muted" className="mt-2">
            {error(accountError)}
          </Typography>
          <Button className="mt-5" onPress={retryAccountLoad}>
            {t("Try again")}
          </Button>
        </Card>
      </main>
    );
  }

  if (sessionStatus === "signed-out") return <SignedOutScreen />;
  if (workspaces.length === 0) return <WorkspaceOnboarding />;
  return <AppShellContent>{children}</AppShellContent>;
}

function AppShellContent({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const reportsActive = location.pathname === "/reports";
  const [reportsOpen, setReportsOpen] = useState(reportsActive);

  useEffect(() => {
    setReportsOpen(reportsActive);
  }, [location.pathname, reportsActive]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <IdleDetectionPrompt />
      <Link className="sr-only" href="#main-content">
        {t("Skip to content")}
      </Link>
      <div className="min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden p-2 md:flex ${
            collapsed ? "w-20" : "w-56"
          }`}
        >
          <div
            className={`flex gap-1 px-1 py-2 ${collapsed ? "flex-col items-center" : "items-center"}`}
          >
            <div className={collapsed ? "flex w-10 justify-center" : "min-w-0 flex-1"}>
              <ProfileMenu showName={!collapsed} />
            </div>
            <Button
              aria-label={t("Toggle sidebar")}
              isIconOnly
              size="sm"
              variant="ghost"
              className={`shrink-0 ${collapsed ? "size-10 min-w-10" : ""}`}
              onPress={() => setCollapsed((c) => !c)}
            >
              <LayoutSideContentLeft aria-hidden="true" className="size-4" />
            </Button>
          </div>

          <SidebarNavigation
            collapsed={collapsed}
            reportsOpen={reportsOpen}
            onReportsOpenChange={setReportsOpen}
          />

          <div
            className={`relative z-10 mt-3 shrink-0 ${collapsed ? "flex justify-center" : "px-1"}`}
          >
            <WorkspaceSwitcher collapsed={collapsed} popoverPlacement="footer" />
          </div>
          <Separator orientation="vertical" className="absolute right-0 top-0 h-full" />
        </aside>

        <div className={`min-h-screen min-w-0 ${collapsed ? "md:pl-20" : "md:pl-56"}`}>
          <header
            className={`fixed inset-x-0 top-0 z-20 bg-background ${
              collapsed ? "md:left-20" : "md:left-56"
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <div className="md:hidden">
                <Button
                  aria-label={t("Open navigation")}
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  onPress={() => setMobileNavOpen(true)}
                >
                  <Bars aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                <GlobalSearchForm
                  className="max-w-sm"
                  query={query}
                  onQueryChange={setQuery}
                  onSubmit={() => navigate({ to: "/search", search: { q: query } })}
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <HeaderTimerControl />
              </div>
            </div>
            <Separator />
          </header>

          <div aria-hidden="true" className="h-[61px] shrink-0 sm:h-[65px]" />

          <main id="main-content" tabIndex={-1} className="min-w-0 w-full flex-1 px-4 py-6 md:px-8">
            {children}
          </main>
        </div>

        <Drawer isOpen={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DrawerTriggerRegistration />
          <Drawer.Backdrop>
            <Drawer.Content placement="left" className="w-[min(18rem,calc(100vw-1rem))]">
              <Drawer.Dialog className="flex h-full flex-col">
                <Drawer.Header className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <ProfileMenu showName />
                  </div>
                  <div className="sr-only">
                    <Drawer.Heading>{t("Navigation")}</Drawer.Heading>
                    <Typography type="body-xs" color="muted" className="mt-0.5">
                      {t("Trackify")}
                    </Typography>
                  </div>
                  <Drawer.CloseTrigger aria-label={t("Close navigation")} />
                </Drawer.Header>
                <Drawer.Body className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  <SidebarNavigation
                    reportsOpen={reportsOpen}
                    onReportsOpenChange={setReportsOpen}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                </Drawer.Body>
                <Drawer.Footer className="flex shrink-0 flex-col gap-2 px-3 py-3">
                  <WorkspaceSwitcher popoverPlacement="footer" />
                </Drawer.Footer>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>

        <CommandMenu
          isOpen={cmdOpen}
          onOpenChange={setCmdOpen}
          onLogTime={() => setLogOpen(true)}
        />
        <LogTimeModal isOpen={logOpen} onOpenChange={setLogOpen} />
      </div>
    </>
  );
}

function GlobalSearchForm({
  className,
  query,
  onQueryChange,
  onSubmit,
}: {
  className?: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();

  return (
    <Form
      className={`min-w-0 ${className ?? ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextField fullWidth name="global-search" value={query} onChange={onQueryChange}>
        <Label className="sr-only">{t("Search")}</Label>
        <div className="relative min-w-0">
          <Input placeholder={t("Search…")} />
          <Kbd aria-hidden="true" className="absolute right-2 top-1/2 -translate-y-1/2">
            Ctrl K
          </Kbd>
        </div>
      </TextField>
    </Form>
  );
}

function SignedOutScreen() {
  const { members, currentMember, resumeSession } = useStore();
  const { t, error } = useI18n();
  const activeMembers = members.filter((member) => member.status === "active");
  const [memberId, setMemberId] = useState(
    currentMember?.status === "active" ? currentMember.id : (activeMembers[0]?.id ?? ""),
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const selectedMember = activeMembers.find((member) => member.id === memberId);

  const continueAccount = () => {
    const result = resumeSession(memberId);
    if (!result.success) {
      setSessionError(result.error);
      return;
    }
    setSessionError(null);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center">
          <Clock aria-hidden="true" className="size-6" />
        </div>
        <Typography type="h1" weight="semibold" className="mt-4">
          {t("You are signed out")}
        </Typography>
        <Typography type="body-sm" color="muted" className="mt-2">
          {t("Choose an account to continue.")}
        </Typography>

        {sessionError ? (
          <div className="mt-5 text-left">
            <FormAlert title={t("We couldn't continue")} description={error(sessionError)} />
          </div>
        ) : null}

        {activeMembers.length > 0 ? (
          <div className="mt-5 space-y-4 text-left">
            <div className="flex flex-col gap-2">
              <Label>{t("Account")}</Label>
              <Dropdown>
                <ButtonGroup variant="secondary" size="sm" className="w-full">
                  <Button
                    type="button"
                    aria-label={t("Account")}
                    className="h-9 min-w-0 flex-1 justify-start"
                  >
                    {selectedMember?.name ?? t("Account")}
                  </Button>
                  <Dropdown.Trigger
                    aria-label={t("Choose account")}
                    className="h-9 w-9 min-w-9 shrink-0 px-0"
                  >
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </Dropdown.Trigger>
                </ButtonGroup>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    aria-label={t("Account")}
                    selectionMode="single"
                    selectedKeys={new Set(memberId ? [memberId] : [])}
                    onAction={(key) => {
                      setMemberId(String(key));
                      setSessionError(null);
                    }}
                  >
                    {activeMembers.map((member) => (
                      <Dropdown.Item key={member.id} id={member.id} textValue={member.name}>
                        <div className="flex min-w-0 flex-col">
                          <Label>{member.name}</Label>
                          <Description>{t(member.role)}</Description>
                        </div>
                        <Dropdown.ItemIndicator />
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
            <Button className="w-full" onPress={continueAccount} isDisabled={!memberId}>
              {t("Continue")}
            </Button>
          </div>
        ) : (
          <Typography type="body-sm" color="muted" className="mt-5">
            {t("No accounts available.")}
          </Typography>
        )}
      </Card>
    </main>
  );
}
