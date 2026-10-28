import type { QueryClient } from "../data-api.mjs";
export function extensionOptions(body: Record<string, unknown>): {
  description: string;
  urgent: boolean;
  favorite: boolean | undefined;
  memberIds: string[];
};
export function extensionCard(value: unknown): {
  id: string;
  name: string;
  url: string;
  board: string;
};
export function extensionElapsed(row: Record<string, unknown>, now: number): number;
export function extensionTask(body: Record<string, unknown>): {
  name: string;
  card: ReturnType<typeof extensionCard> | null;
};
export function extensionContext(
  client: QueryClient,
  user: { id: string },
  body: Record<string, unknown>,
): Promise<Record<string, unknown>>;
export function extensionTimerAction(
  client: QueryClient,
  user: { id: string },
  body: Record<string, unknown>,
): Promise<Record<string, unknown>>;
