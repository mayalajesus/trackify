export interface TaskInvitationResponse {
  id: string;
  task: string;
  recipientName: string;
  status: "pending" | "accepted" | "declined";
}

export function newTaskInvitationResponses(
  previous: Record<string, string> | null,
  current: TaskInvitationResponse[],
) {
  // First use establishes a baseline rather than replaying historical responses.
  return previous === null
    ? []
    : current.filter(
        (item) =>
          (item.status === "accepted" || item.status === "declined") &&
          previous[item.id] !== item.status,
      );
}
