import { Button } from "@heroui/react/button";
import { Toast } from "@heroui/react/toast";
import { Typography } from "@heroui/react/typography";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../components/layout/app-shell";
import { defaultLocale, translate, type Locale, useI18n } from "../lib/i18n";
import { StoreProvider } from "../lib/store";
import { AuthProvider } from "../lib/auth-context";
import { AccountLifecycleProvider } from "../lib/account-lifecycle-context";
import { captureClientError } from "../lib/observability";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

function getRootFallbackLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  return document.documentElement.lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US";
}

function NotFoundComponent() {
  const navigate = useNavigate();
  const locale = getRootFallbackLocale();
  const t = (key: string) => translate(key, locale);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <Typography type="h1" weight="bold">
          404
        </Typography>
        <Typography type="h2" weight="semibold" className="mt-4">
          {t("Page not found")}
        </Typography>
        <Typography type="body-sm" color="muted" className="mt-2">
          {t("The page you're looking for doesn't exist or has been moved.")}
        </Typography>
        <div className="mt-6">
          <Button onPress={() => navigate({ to: "/" })}>{t("Go home")}</Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const locale = getRootFallbackLocale();
  const t = (key: string) => translate(key, locale);

  useEffect(() => {
    captureClientError(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <Typography type="h1" weight="semibold">
          {t("We couldn't load this page")}
        </Typography>
        <Typography type="body-sm" color="muted" className="mt-2">
          {t("We couldn't load this page. Try again or go back to the home page.")}
        </Typography>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onPress={() => {
              router.invalidate();
              reset();
            }}
          >
            {t("Try again")}
          </Button>
          <Button variant="secondary" onPress={() => router.navigate({ to: "/" })}>
            {t("Go home")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Trackify — Simple time tracking" },
      {
        name: "description",
        content: "Start a timer, organize your work and understand where your hours go.",
      },
      { name: "author", content: "Trackify" },
      { property: "og:title", content: "Trackify — Simple time tracking" },
      {
        property: "og:description",
        content: "A calm, focused workspace for tracking time across projects and clients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountLifecycleProvider>
          <StoreProvider>
            <AppShell>
              <RootOutlet />
            </AppShell>
          </StoreProvider>
        </AccountLifecycleProvider>
      </AuthProvider>
      <Toast.Provider
        className="[&_.toast]:pe-14 [&_.toast__close-button]:pointer-events-auto [&_.toast__close-button]:end-3 [&_.toast__close-button]:top-3 [&_.toast__close-button]:size-7 [&_.toast__close-button]:border [&_.toast__close-button]:border-border [&_.toast__close-button]:bg-surface-tertiary [&_.toast__close-button]:text-[var(--surface-tertiary-foreground)] [&_.toast__close-button]:opacity-100 [&_.toast__close-button:hover]:bg-default [&_.toast__close-button[data-hovered='true']]:bg-default [&_.toast__close-button:focus-visible]:ring-2 [&_.toast__close-button:focus-visible]:ring-focus [&_.toast__close-button_[data-slot='close-button-icon']]:size-4"
        placement="bottom end"
        width={360}
        gap={8}
        maxVisibleToasts={3}
      />
    </QueryClientProvider>
  );
}

function RootOutlet() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const metadata: Record<string, { title: string; description: string; ogDescription: string }> =
      {
        "/": {
          title: t("Trackify — Time tracking for small teams"),
          description: t(
            "Trackify is a minimal time tracker for freelancers and small teams: live timer, time entries, reports and client billing.",
          ),
          ogDescription: t(
            "Track hours, manage projects and bill clients with a calm, focused workspace.",
          ),
        },
        "/tracker": {
          title: `${t("Tracker")} — Trackify`,
          description: t(
            "Start the live timer, log time and manage your entries in one focused workspace.",
          ),
          ogDescription: t("Live timer and daily time entries in one focused view."),
        },
        "/today": {
          title: `${t("Tracker")} — Trackify`,
          description: t(
            "Start the live timer, log time and manage your entries in one focused workspace.",
          ),
          ogDescription: t("Live timer and daily time entries in one focused view."),
        },
        "/projects": {
          title: `${t("Projects")} — Trackify`,
          description: t(
            "Track hours per project, monitor status and open detailed project breakdowns.",
          ),
          ogDescription: t("All client and internal projects with tracked time at a glance."),
        },
        "/clients": {
          title: `${t("Clients")} — Trackify`,
          description: t("Manage clients, contacts and the projects connected to each client."),
          ogDescription: t("Client list with contacts and tracked time."),
        },
        "/team": {
          title: `${t("Team")} — Trackify`,
          description: t("Invite teammates, manage roles and track team hours."),
          ogDescription: t("Invite teammates and see tracked hours by member."),
        },
        "/reports": {
          title: `${t("Reports")} — Trackify`,
          description: t("Detailed, summary, weekly and team time reports."),
          ogDescription: t("Filter and understand tracked time."),
        },
        "/integrations": {
          title: `${t("Integrations")} — Trackify`,
          description: t("Connect Trackify to Trello and sync cards into tracked tasks."),
          ogDescription: t("Trello sync for your time tracking."),
        },
        "/settings": {
          title: `${t("Settings")} — Trackify`,
          description: t("Workspace settings and personal preferences."),
          ogDescription: t("Configure your Trackify workspace."),
        },
        "/search": {
          title: `${t("Search")} — Trackify`,
          description: t("Search projects, clients, teammates and time entries."),
          ogDescription: t("Find anything in your workspace."),
        },
      };
    const current = metadata[pathname] ?? metadata["/"]!;
    document.title = current.title;
    for (const [selector, content] of [
      ['meta[name="description"]', current.description],
      ['meta[property="og:title"]', current.title],
      ['meta[property="og:description"]', current.ogDescription],
    ] as const) {
      document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
    }
  }, [pathname, t]);

  return <Outlet />;
}
