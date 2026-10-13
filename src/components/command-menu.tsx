import { Input } from "@heroui/react/input";
import { Kbd } from "@heroui/react/kbd";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { TextField } from "@heroui/react/textfield";
import { Typography } from "@heroui/react/typography";
import { toast } from "@/lib/toast";
import { useNavigate } from "@tanstack/react-router";
import {
  Calendar,
  ChartColumn,
  Folder,
  Gear,
  Magnifier,
  Person,
  Persons,
  Play,
  PlugConnection,
  Plus,
} from "@gravity-ui/icons";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { focusTimerTaskInput } from "@/lib/timer-input";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { formatOverlapConflict } from "@/components/overlap-confirmation";

interface Command {
  id: string;
  label: string;
  hint: string;
  group: "Navigation" | "Actions" | "Projects" | "Clients";
  icon: ReactNode;
  run: () => void;
}

export function CommandMenu({
  isOpen,
  onOpenChange,
  onLogTime,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onLogTime: () => void;
}) {
  const navigate = useNavigate();
  const { projects, clients, timer, stopTimer } = useStore();
  const { locale, t, error } = useI18n();
  const [query, setQuery] = useState("");

  const close = () => {
    setQuery("");
    onOpenChange(false);
  };

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      {
        id: "nav-tracker",
        label: t("Tracker"),
        hint: t("Go to tracker"),
        icon: <Calendar className="size-4" />,
        group: "Navigation",
        run: () => navigate({ to: "/tracker" }),
      },
      {
        id: "nav-projects",
        label: t("Projects"),
        hint: t("Manage projects"),
        icon: <Folder className="size-4" />,
        group: "Navigation",
        run: () => navigate({ to: "/projects" }),
      },
      {
        id: "nav-clients",
        label: t("Clients"),
        hint: t("Manage clients"),
        icon: <Person className="size-4" />,
        group: "Navigation",
        run: () => navigate({ to: "/clients" }),
      },
      {
        id: "nav-team",
        label: t("Team"),
        hint: t("Members and roles"),
        icon: <Persons className="size-4" />,
        group: "Navigation",
        run: () => navigate({ to: "/team" }),
      },
      {
        id: "nav-reports",
        label: t("Reports"),
        hint: t("Time analytics"),
        icon: <ChartColumn className="size-4" />,
        group: "Navigation",
        run: () => navigate({ to: "/reports", search: { view: "detailed" } }),
      },
      {
        id: "nav-integrations",
        label: t("Integrations"),
        hint: t("Trello and more"),
        icon: <PlugConnection className="size-4" />,
        group: "Navigation",
        run: () => navigate({ to: "/integrations" }),
      },
      {
        id: "nav-settings",
        label: t("Settings"),
        hint: t("Workspace settings"),
        icon: <Gear className="size-4" />,
        group: "Navigation",
        run: () => navigate({ to: "/settings" }),
      },
    ];

    const actions: Command[] = [
      {
        id: "action-timer",
        label: timer.status === "idle" ? t("Start timer") : t("Stop timer"),
        hint:
          timer.status === "idle"
            ? t("Enter a task name and select a project before starting.")
            : t("Save the running entry"),
        icon: <Play className="size-4" />,
        group: "Actions",
        run: () => {
          if (timer.status === "idle") {
            void navigate({ to: "/tracker" }).then(() => {
              requestAnimationFrame(() => focusTimerTaskInput(t("A task is required.")));
            });
            return;
          }
          const result = stopTimer();
          if (!result.success) {
            toast.danger(error(result.error));
          } else if (result.warning) {
            toast.info(t("Overlapping time"), {
              description: result.conflict
                ? formatOverlapConflict(result.conflict, locale)
                : error(result.warning),
            });
          }
        },
      },
      ...(timer.status === "idle"
        ? [
            {
              id: "action-log",
              label: t("Log time manually"),
              hint: t("Add a past entry"),
              icon: <Plus className="size-4" />,
              group: "Actions" as const,
              run: onLogTime,
            },
          ]
        : []),
      {
        id: "action-search",
        label: query ? t('Search for "{query}"', { query }) : t("Global search"),
        hint: t("Open search results"),
        icon: <Magnifier className="size-4" />,
        group: "Actions",
        run: () => navigate({ to: "/search", search: { q: query } }),
      },
    ];

    const projectCommands: Command[] = projects.map((p) => ({
      id: `project-${p.id}`,
      label: p.name,
      hint: t("Open project"),
      icon: <Folder className="size-4" />,
      group: "Projects",
      run: () => navigate({ to: "/projects/$projectId", params: { projectId: p.id } }),
    }));

    const clientCommands: Command[] = clients.map((c) => ({
      id: `client-${c.id}`,
      label: c.name,
      hint: t("Open clients"),
      icon: <Person className="size-4" />,
      group: "Clients",
      run: () => navigate({ to: "/clients" }),
    }));

    return [...actions, ...nav, ...projectCommands, ...clientCommands];
  }, [clients, error, locale, navigate, onLogTime, projects, query, stopTimer, t, timer.status]);

  const filtered = commands.filter((c) =>
    `${c.label} ${c.group}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const groups: Command["group"][] = ["Actions", "Navigation", "Projects", "Clients"];

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) setQuery("");
        onOpenChange(open);
      }}
    >
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container placement="top" size="sm">
          <Modal.Dialog className="tracker-command-menu">
            <div className="tracker-command-search">
              <TextField fullWidth name="command-search" value={query} onChange={setQuery}>
                <Label className="sr-only">{t("Command menu search")}</Label>
                <Input
                  autoFocus
                  placeholder={t("Search commands, projects, clients…")}
                  variant="secondary"
                />
              </TextField>
            </div>
            <div className="tracker-command-list">
              {filtered.length === 0 ? (
                <Typography type="body-sm" color="muted" align="center" className="px-3 py-8">
                  {t("No results for “{query}”.", { query })}
                </Typography>
              ) : (
                <ListBox
                  aria-label={t("Commands")}
                  selectionMode="none"
                  onAction={(key) => {
                    const cmd = commands.find((c) => c.id === String(key));
                    close();
                    cmd?.run();
                  }}
                >
                  {groups
                    .filter((g) => filtered.some((c) => c.group === g))
                    .map((group) => (
                      <ListBox.Section key={group}>
                        <ListBox.Item
                          key={`${group}-header`}
                          id={`${group}-header`}
                          isDisabled
                          textValue={group}
                        >
                          <Label>{t(group)}</Label>
                        </ListBox.Item>
                        {filtered
                          .filter((c) => c.group === group)
                          .map((c) => (
                            <ListBox.Item key={c.id} id={c.id} textValue={c.label}>
                              <span className="flex items-center gap-2">
                                {c.icon}
                                <Label>{c.label}</Label>
                              </span>
                            </ListBox.Item>
                          ))}
                      </ListBox.Section>
                    ))}
                </ListBox>
              )}
            </div>
            <div className="tracker-command-footer">
              <Typography type="body-xs" color="muted">
                {t("Navigate with arrow keys")}
              </Typography>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd> {t("to close")}
              </span>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
