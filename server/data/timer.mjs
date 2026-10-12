import { numberValue } from "./validation.mjs";

export function timerFromRow(row) {
  return {
    status: row.status,
    workspaceId: row.workspace_id,
    task: row.task,
    ...(row.task_details ? { taskDetails: row.task_details } : {}),
    projectId: row.project_id,
    billable: row.billable,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    startedDate: row.started_date,
    accumulated: row.accumulated_seconds,
    startClock: row.start_clock.slice(0, 5),
    ...(row.hourly_rate !== null ? { hourlyRate: numberValue(row.hourly_rate) } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
  };
}
