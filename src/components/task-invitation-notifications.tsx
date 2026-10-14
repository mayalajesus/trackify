import { useEffect } from "react";
import { request } from "@/lib/api-data-source";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import {
  newTaskInvitationResponses,
  type TaskInvitationResponse,
} from "@/lib/task-invitation-responses";

export function TaskInvitationNotifications() {
  const { activeWorkspaceId, currentUserId } = useStore();
  const { t } = useI18n();
  useEffect(() => {
    if (!activeWorkspaceId || !currentUserId) return;
    const key = `trackify:task-responses:${currentUserId}:${activeWorkspaceId}`;
    let seen: Record<string, string> | null = null;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.values(value).every((item) => typeof item === "string")
      )
        seen = value as Record<string, string>;
    } catch {
      /* Storage may be unavailable; still deduplicate within this session. */
    }
    let cancelled = false;
    let busy = false;
    const load = async () => {
      if (cancelled || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const result = await request<TaskInvitationResponse[]>("listTaskInvitationResponses", {
          workspaceId: activeWorkspaceId,
        });
        if (cancelled || !result.success) return;
        for (const item of newTaskInvitationResponses(seen, result.data)) {
          const title = t(
            item.status === "accepted"
              ? "{name} accepted the collaboration"
              : "{name} declined the collaboration",
            { name: item.recipientName },
          );
          if (item.status === "accepted") toast.success(title, { description: item.task });
          else toast.info(title, { description: item.task });
        }
        seen = Object.fromEntries(result.data.map((item) => [item.id, item.status]));
        try {
          localStorage.setItem(key, JSON.stringify(seen));
        } catch {
          /* Keep the in-memory baseline. */
        }
      } finally {
        busy = false;
      }
    };
    const check = () => {
      void load();
    };
    check();
    const interval = window.setInterval(check, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [activeWorkspaceId, currentUserId, t]);
  return null;
}
