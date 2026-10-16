import type { QueryClient } from "../data-api.mjs";
export function extensionCard(value: unknown): {
  id: string;
  name: string;
  url: string;
  board: string;
};
export function extensionElapsed(row: Record<string, unknown>, now: number): number;
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
