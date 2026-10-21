import { accountsEqual } from "../../shared/account-merge.mjs";
import { DataApiError } from "../data-api-error.mjs";

export function assertTimerUnchanged(expected, current, desired) {
  if (expected === undefined) return; // Older clients and internal server operations.
  const normalize = (timer) => (timer?.status === "idle" ? null : timer);
  if (desired !== undefined && accountsEqual(normalize(desired), normalize(current))) return;
  if (!accountsEqual(normalize(expected), normalize(current)))
    throw new DataApiError(
      409,
      "O cronômetro mudou em outra sessão. Suas alterações locais foram preservadas.",
      { code: "timer_conflict" },
    );
}
