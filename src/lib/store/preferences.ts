import type { UserPreferences } from "../account-types";

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function getInitialTimeZone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(timezone) ? timezone : "UTC";
  } catch {
    return "UTC";
  }
}

export function getDevicePreferences(
  storedPreferences: UserPreferences,
  deviceTimeZone = getInitialTimeZone(),
): UserPreferences {
  // The device clock is authoritative; API defaults or another device's saved zone
  // must not shift the local dates and clock values used for tracking time.
  return storedPreferences.timezone === deviceTimeZone
    ? storedPreferences
    : { ...storedPreferences, timezone: deviceTimeZone };
}
