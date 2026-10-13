import { Button } from "@heroui/react/button";
import { Avatar } from "@heroui/react/avatar";
import { Card } from "@heroui/react/card";
import { Description } from "@heroui/react/description";
import { Dropdown } from "@heroui/react/dropdown";
import { Modal } from "@heroui/react/modal";
import { Typography } from "@heroui/react/typography";
import { toast } from "@/lib/toast";
import { Check, ChevronDown, Layers3Diagonal } from "@gravity-ui/icons";
import { useState } from "react";
import { ModalLayout } from "@/components/modal-layout";
import { useI18n } from "@/lib/i18n";
import { useStore, type WorkspaceSummary } from "@/lib/store";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";

function WorkspaceLogo({
  workspace,
  enlarged = false,
}: {
  workspace: WorkspaceSummary;
  enlarged?: boolean;
}) {
  return (
    <Avatar
      aria-hidden="true"
      className={`${enlarged ? "size-10" : "size-4"} shrink-0 overflow-hidden rounded-full`}
      size="sm"
    >
      {workspace.logoDataUrl ? (
        <Avatar.Image
          alt=""
          src={workspace.logoDataUrl}
          className={enlarged ? "size-full object-cover" : "object-contain"}
        />
      ) : null}
      <Avatar.Fallback className={enlarged ? undefined : "bg-transparent"}>
        <Layers3Diagonal className="size-4" />
      </Avatar.Fallback>
    </Avatar>
  );
}

function WorkspaceItem({ workspace, active }: { workspace: WorkspaceSummary; active: boolean }) {
  const { t } = useI18n();
  return (
    <Dropdown.Item
      id={workspace.id}
      textValue={`${workspace.name} ${workspace.ownerName} ${workspace.role}`}
      aria-current={active ? "true" : undefined}
      className="min-h-10 px-2.5 py-1"
    >
      <WorkspaceLogo workspace={workspace} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <Typography
            type="body-sm"
            weight={active ? "semibold" : "medium"}
            truncate
            className="min-w-0 flex-1"
          >
            {workspace.name}
          </Typography>
          {workspace.status === "archived" ? (
            <Typography type="body-xs" color="muted" className="shrink-0">
              {t("Archived")}
            </Typography>
          ) : null}
        </span>
        <Typography type="body-xs" color="muted" truncate>
          {workspace.isOwned ? t(workspace.role) : `${workspace.ownerName} · ${t(workspace.role)}`}
        </Typography>
      </span>
      {active ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
    </Dropdown.Item>
  );
}

export function WorkspaceSwitcher({
  collapsed = false,
  popoverPlacement = "bottom",
}: {
  collapsed?: boolean;
  popoverPlacement?: "bottom" | "footer";
}) {
  const { workspaces, activeWorkspaceId, currentWorkspace, timer, switchWorkspace, pauseTimer } =
    useStore();
  const { t, error } = useI18n();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);

  if (!currentWorkspace) return null;
  const activeWorkspaces = workspaces.filter((workspace) => workspace.status === "active");
  const currentSummary = activeWorkspaces.find((workspace) => workspace.id === activeWorkspaceId);
  if (!currentSummary) return null;
  const own = activeWorkspaces.filter((workspace) => workspace.isOwned);
  const shared = activeWorkspaces.filter((workspace) => !workspace.isOwned);

  const showResult = (result: ReturnType<typeof switchWorkspace>) => {
    if (!result.success) toast.danger(error(result.error));
  };

  const requestSwitch = (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) return;
    if (timer.status === "running") {
      setPendingWorkspaceId(workspaceId);
      setSwitchOpen(true);
      return;
    }
    const result = switchWorkspace(workspaceId);
    if (result.success) return;
    showResult(result);
  };

  const confirmSwitch = () => {
    if (!pendingWorkspaceId) return;
    pauseTimer();
    const result = switchWorkspace(pendingWorkspaceId);
    if (result.success) {
      setSwitchOpen(false);
      setPendingWorkspaceId(null);
      return;
    }
    showResult(result);
  };

  const pendingWorkspace = activeWorkspaces.find(
    (workspace) => workspace.id === pendingWorkspaceId,
  );
  const triggerContent = (
    <>
      <WorkspaceLogo workspace={currentSummary} enlarged={collapsed} />
      {!collapsed ? (
        <span className="flex min-w-0 flex-1 items-center">
          <Typography type="body-sm" weight="semibold" truncate className="min-w-0 flex-1">
            {currentSummary.name}
          </Typography>
        </span>
      ) : null}
      {!collapsed ? <ChevronDown aria-hidden="true" className="size-4 shrink-0" /> : null}
      {collapsed ? <span className="sr-only">{currentSummary.name}</span> : null}
    </>
  );
  const workspaceMenu = (
    <Dropdown.Menu aria-label={t("Workspaces")} onAction={(key) => requestSwitch(String(key))}>
      {own.length > 0 ? (
        <Dropdown.Section aria-label={t("Your workspaces")}>
          <Dropdown.Item
            id="owned-heading"
            isDisabled
            textValue={t("Your workspaces")}
            className="min-h-7 px-2.5 py-1"
          >
            <Typography type="body-xs" color="muted" weight="semibold">
              {t("Your workspaces")}
            </Typography>
          </Dropdown.Item>
          {own.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              active={workspace.id === activeWorkspaceId}
            />
          ))}
        </Dropdown.Section>
      ) : null}
      {shared.length > 0 ? (
        <Dropdown.Section aria-label={t("Shared with you")}>
          <Dropdown.Item
            id="shared-heading"
            isDisabled
            textValue={t("Shared with you")}
            className="min-h-7 px-2.5 py-1"
          >
            <Typography type="body-xs" color="muted" weight="semibold">
              {t("Shared with you")}
            </Typography>
          </Dropdown.Item>
          {shared.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              active={workspace.id === activeWorkspaceId}
            />
          ))}
        </Dropdown.Section>
      ) : null}
    </Dropdown.Menu>
  );

  return (
    <>
      <Card
        variant="secondary"
        className={
          collapsed
            ? "workspace-selector size-10 shrink-0 gap-0 rounded-full p-0 shadow-none"
            : "workspace-selector w-full rounded-[22px] border p-0"
        }
      >
        <Dropdown>
          <Dropdown.Trigger
            aria-label={t("Switch workspace")}
            className={
              collapsed
                ? "flex size-10 min-h-10 min-w-10 items-center justify-center p-0"
                : "flex h-9 min-w-0 w-full items-center gap-2.5 rounded-[22px] px-3 py-0"
            }
          >
            {triggerContent}
          </Dropdown.Trigger>
          <Dropdown.Popover
            placement={
              collapsed ? "right" : popoverPlacement === "footer" ? "top start" : "bottom start"
            }
            shouldFlip
            containerPadding={12}
            offset={8}
            className="min-w-64 max-w-[calc(100vw-1rem)]"
          >
            {workspaceMenu}
          </Dropdown.Popover>
        </Dropdown>
      </Card>

      <Modal isOpen={switchOpen} onOpenChange={setSwitchOpen}>
        <ModalTriggerRegistration />
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <ModalLayout.Header>{t("Pause timer before switching?")}</ModalLayout.Header>
              <ModalLayout.Body>
                <Typography type="body-sm" color="muted">
                  {t(
                    "Your active timer is running in {workspace}. Pause it before opening another workspace.",
                    {
                      workspace: pendingWorkspace?.name ?? t("workspace"),
                    },
                  )}
                </Typography>
                <div className="flex items-center gap-2 p-3">
                  <WorkspaceLogo workspace={currentSummary} />
                  <div className="min-w-0">
                    <Typography type="body-sm" weight="semibold" truncate>
                      {currentSummary.name}
                    </Typography>
                    <Description>
                      {t("The timer will remain paused in its original workspace.")}
                    </Description>
                  </div>
                </div>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button variant="tertiary" onPress={() => setSwitchOpen(false)}>
                  {t("Cancel")}
                </Button>
                <Button onPress={confirmSwitch}>{t("Pause and switch")}</Button>
              </ModalLayout.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
