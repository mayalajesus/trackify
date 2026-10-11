import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Tooltip } from "@heroui/react/tooltip";
import { ProfileAvatar } from "./profile-avatar";
import { useStore } from "@/lib/store";
import { request } from "@/lib/api-data-source";
import type { TimeEntry } from "@/lib/domain";

const ParticipantsContext = createContext<Array<{ taskId: string; userId: string }>>([]);

export function TaskParticipantsProvider({ children }: { children: ReactNode }) {
  const { activeWorkspaceId, currentUserId } = useStore();
  const [participants, setParticipants] = useState<Array<{ taskId: string; userId: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    setParticipants([]);
    const load = async () => {
      const result = await request<typeof participants>("listTaskParticipants", {
        workspaceId: activeWorkspaceId,
      });
      if (!cancelled && result.success) setParticipants(result.data);
    };
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeWorkspaceId, currentUserId]);
  return (
    <ParticipantsContext.Provider value={participants}>{children}</ParticipantsContext.Provider>
  );
}

export function TrackerTaskTeam({ entries }: { entries: TimeEntry[] }) {
  const { members, preferencesByUserId } = useStore();
  const participants = useContext(ParticipantsContext);
  const taskIds = new Set(entries.map((entry) => entry.taskDetails?.id));
  const ids = new Set([
    ...entries.map((entry) => entry.userId),
    ...participants.filter((item) => taskIds.has(item.taskId)).map((item) => item.userId),
  ]);
  const team = [...ids].flatMap((id) => {
    const member = members.find((item) => item.id === id);
    return member ? [member] : [];
  });
  if (!team.length) return <span className="text-muted">—</span>;
  return (
    <Tooltip delay={250}>
      <Tooltip.Trigger
        className="flex items-center justify-center -space-x-2"
        aria-label={team.map((member) => member.name).join(", ")}
      >
        {team.slice(0, 2).map((member) => (
          <span key={member.id} className="tracker-team-avatar rounded-full ring-2 ring-surface">
            <ProfileAvatar
              member={member}
              avatarUrl={preferencesByUserId[member.id]?.avatarUrl ?? null}
            />
          </span>
        ))}
        {team.length > 2 ? (
          <span className="relative flex size-7 items-center justify-center rounded-full bg-accent-soft text-xs text-accent ring-2 ring-surface">
            +{team.length - 2}
          </span>
        ) : null}
      </Tooltip.Trigger>
      <Tooltip.Content>{team.map((member) => member.name).join(", ")}</Tooltip.Content>
    </Tooltip>
  );
}
