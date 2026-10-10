import { Button } from "@heroui/react/button";
import { Popover } from "@heroui/react/popover";
import { ScrollShadow } from "@heroui/react/scroll-shadow";
import { Separator } from "@heroui/react/separator";
import { Typography } from "@heroui/react/typography";
import { Tooltip } from "@heroui/react/tooltip";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChartColumn,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  Layers3Diagonal,
  Person,
  Persons,
  Puzzle,
} from "@gravity-ui/icons";
import type { ComponentType, SVGProps } from "react";
import { useI18n } from "@/lib/i18n";
import { normalizeReportView, reportViews } from "@/lib/report-views";

type NavigationItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const trackerNavigation: NavigationItem = { to: "/tracker", label: "Tracker", icon: Clock };

const managementNavigation: NavigationItem[] = [
  { to: "/projects", label: "Projects", icon: Folder },
  { to: "/clients", label: "Clients", icon: Person },
  { to: "/team", label: "Team", icon: Persons },
];

const moreNavigation: NavigationItem[] = [
  { to: "/integrations", label: "Integrations", icon: Puzzle },
  { to: "/workspaces", label: "Workspaces", icon: Layers3Diagonal },
];

function getReportView(search: unknown) {
  if (search && typeof search === "object" && "view" in search) {
    return normalizeReportView((search as { view?: unknown }).view);
  }
  return "detailed";
}

function isNavigationItemActive(pathname: string, item: NavigationItem) {
  return pathname === item.to || (item.to !== "/tracker" && pathname.startsWith(`${item.to}/`));
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography type="body-xs" className="px-2.5 pb-1 pt-3 font-normal text-foreground">
      {children}
    </Typography>
  );
}

function NavigationLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavigationItem;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const active = isNavigationItemActive(location.pathname, item);

  const button = (
    <Button
      {...(active ? { "aria-current": "page" as const } : {})}
      {...(collapsed ? { "aria-label": t(item.label) } : {})}
      isIconOnly={collapsed}
      variant={active ? "tertiary" : "ghost"}
      className={
        collapsed
          ? "mx-auto flex h-10 min-h-10 w-10 px-2.5 py-0"
          : "h-10 min-h-10 w-full justify-start gap-3 px-3 py-0"
      }
      onPress={() => {
        void navigate({ to: item.to });
        onNavigate?.();
      }}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <item.icon aria-hidden="true" className="size-4" />
      </span>
      {!collapsed ? (
        <Typography
          type="body-sm"
          weight={active ? "semibold" : "medium"}
          truncate
          className="min-w-0 flex-1 text-left"
        >
          {t(item.label)}
        </Typography>
      ) : null}
    </Button>
  );

  return collapsed ? (
    <Tooltip delay={300} closeDelay={0}>
      {button}
      <Tooltip.Content placement="right" showArrow>
        {t(item.label)}
      </Tooltip.Content>
    </Tooltip>
  ) : (
    button
  );
}

function ReportsNavigation({
  collapsed,
  reportsOpen,
  onReportsOpenChange,
  onNavigate,
}: {
  collapsed: boolean;
  reportsOpen: boolean;
  onReportsOpenChange: (open: boolean) => void;
  onNavigate: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const reportsActive = location.pathname === "/reports";
  const activeReportView = getReportView(location.search);

  const reportLinks = (
    <nav aria-label={t("Report views")} className="space-y-0.5">
      {reportViews.map((view) => {
        const active = reportsActive && activeReportView === view.id;
        return (
          <Button
            key={view.id}
            {...(active ? { "aria-current": "page" as const } : {})}
            variant={active ? "tertiary" : "ghost"}
            className="h-10 min-h-10 w-full justify-start px-3 py-0"
            onPress={() => {
              const currentReportSearch =
                reportsActive && location.search && typeof location.search === "object"
                  ? location.search
                  : {};
              void navigate({
                to: "/reports",
                search: { ...currentReportSearch, view: view.id },
              });
              onNavigate?.();
            }}
          >
            <Typography
              type="body-sm"
              weight={active ? "semibold" : "medium"}
              className="min-w-0 flex-1 text-left"
            >
              {t(view.label)}
            </Typography>
          </Button>
        );
      })}
    </nav>
  );

  if (collapsed) {
    return (
      <Popover isOpen={reportsOpen} onOpenChange={onReportsOpenChange}>
        <Tooltip delay={300} closeDelay={0} isDisabled={reportsOpen}>
          <Button
            aria-controls="reports-submenu-collapsed"
            aria-expanded={reportsOpen}
            aria-label={t("Reports")}
            isIconOnly
            variant={reportsActive ? "tertiary" : "ghost"}
            className="mx-auto flex h-10 min-h-10 w-10 px-2.5 py-0"
          >
            <span className="flex size-5 shrink-0 items-center justify-center">
              <ChartColumn aria-hidden="true" className="size-4" />
            </span>
          </Button>
          <Tooltip.Content placement="right" showArrow>
            {t("Reports")}
          </Tooltip.Content>
        </Tooltip>
        <Popover.Content
          placement="right top"
          className="w-44 max-w-[calc(100vw-1rem)] overflow-hidden p-1"
        >
          <div id="reports-submenu-collapsed">{reportLinks}</div>
        </Popover.Content>
      </Popover>
    );
  }

  return (
    <div>
      <Button
        aria-controls="reports-submenu-expanded"
        aria-expanded={reportsOpen}
        aria-label={`${t(reportsOpen ? "Collapse" : "Expand")} ${t("Reports")}`}
        variant={reportsActive ? "tertiary" : "ghost"}
        className="h-10 min-h-10 w-full justify-start gap-3 px-3 py-0"
        onPress={() => onReportsOpenChange(!reportsOpen)}
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <ChartColumn aria-hidden="true" className="size-4" />
        </span>
        <Typography
          type="body-sm"
          weight={reportsActive ? "semibold" : "medium"}
          truncate
          className="min-w-0 flex-1 text-left"
        >
          {t("Reports")}
        </Typography>
        {reportsOpen ? (
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        )}
      </Button>
      {reportsOpen ? (
        <div id="reports-submenu-expanded" className="ml-6 mt-1 flex gap-2 pl-2">
          <Separator orientation="vertical" />
          <div className="min-w-0 flex-1">{reportLinks}</div>
        </div>
      ) : null}
    </div>
  );
}

export function SidebarNavigation({
  collapsed = false,
  reportsOpen,
  onReportsOpenChange,
  onNavigate,
}: {
  collapsed?: boolean;
  reportsOpen: boolean;
  onReportsOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();

  return (
    <ScrollShadow orientation="vertical" hideScrollBar className="min-h-0 flex-1">
      <nav aria-label={t("Main navigation")} className="sidebar-navigation">
        <div className={collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0.5"}>
          <NavigationLink item={trackerNavigation} collapsed={collapsed} onNavigate={onNavigate} />
          <ReportsNavigation
            collapsed={collapsed}
            reportsOpen={reportsOpen}
            onReportsOpenChange={onReportsOpenChange}
            onNavigate={onNavigate}
          />
        </div>

        {!collapsed ? (
          <SectionLabel>{t("Manage")}</SectionLabel>
        ) : (
          <Separator className="mx-auto my-2 w-8" />
        )}
        <div className={`${collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0.5"}`}>
          {managementNavigation.map((item) => (
            <NavigationLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {!collapsed ? (
          <SectionLabel>{t("More")}</SectionLabel>
        ) : (
          <Separator className="mx-auto my-2 w-8" />
        )}
        <div className={collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0.5"}>
          {moreNavigation.map((item) => (
            <NavigationLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </ScrollShadow>
  );
}
