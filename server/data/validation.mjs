import { avatarDataValue as profileAvatarDataValue } from "../auth-profile.mjs";
import { DataApiError } from "../data-api-error.mjs";

export const MAX_INTEGER_SECONDS = 2_147_483_647;

export const allowedCurrencies = new Set(["BRL", "USD", "EUR", "GBP"]);

export const defaultAvatarUrls = [
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/green.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/orange.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/red.jpg",
  "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/purple.jpg",
];

export function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new DataApiError(400, "The data payload contains an invalid identifier.");
  }
  return value;
}

export function dateValue(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      ) {
        return value;
      }
    }
  }
  throw new DataApiError(400, "The data payload contains an invalid date.");
}

export function iso(value) {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
}

export function timeValue(value) {
  if (
    typeof value !== "string" ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value)
  ) {
    throw new DataApiError(400, "The data payload contains an invalid time.");
  }
  return value;
}

export function normalizeProjectName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function numberValue(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function requiredText(value, label, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new DataApiError(400, `${label} must be between 1 and ${maxLength} characters.`);
  }
  return text;
}

export function optionalText(value, label, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (text.length > maxLength) {
    throw new DataApiError(400, `${label} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

export function optionalCurrency(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!allowedCurrencies.has(value)) {
    throw new DataApiError(400, "Choose a valid currency.");
  }
  return value;
}

export function projectColorValue(value) {
  const color = requiredText(value, "Project color", 40).toLowerCase();
  const legacyColors = new Set([
    "accent",
    "bg-accent",
    "success",
    "bg-success",
    "warning",
    "bg-warning",
    "danger",
    "bg-danger",
    "foreground",
    "bg-foreground",
  ]);
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(color) && !legacyColors.has(color)) {
    throw new DataApiError(400, "Choose a valid project color.");
  }
  return color;
}

export function membershipBilling(membership) {
  const hourlyRate = Number(membership?.hourlyRate);
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new DataApiError(400, "Choose a valid hourly rate.");
  }
  if (!allowedCurrencies.has(membership?.currency)) {
    throw new DataApiError(400, "Choose a valid currency.");
  }
  return { hourlyRate, currency: membership.currency };
}

export const avatarDataValue = (value) => profileAvatarDataValue(value, defaultAvatarUrls);

export function defaultAvatarForUser(userId) {
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return defaultAvatarUrls[hash % defaultAvatarUrls.length];
}

export function parseImageDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength > 1_048_576) {
    throw new DataApiError(400, "The image must be smaller than 1 MB.");
  }
  return { bytes, contentType: match[1] };
}

export function favoriteTasksValue(value) {
  const favorites = value ?? {};
  if (
    !favorites ||
    typeof favorites !== "object" ||
    Array.isArray(favorites) ||
    JSON.stringify(favorites).length > 100000 ||
    !Object.values(favorites).every(
      (items) =>
        Array.isArray(items) &&
        items.length <= 100 &&
        items.every(
          (item) =>
            item &&
            typeof item.task === "string" &&
            item.task.trim().length > 0 &&
            item.task.length <= 500 &&
            typeof item.projectId === "string" &&
            item.projectId.length > 0 &&
            typeof item.billable === "boolean",
        ),
    )
  ) {
    throw new DataApiError(400, "Invalid favorite tasks.");
  }
  return favorites;
}

export function reportFiltersValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

export function reportFiltersJson(value) {
  const serialized = JSON.stringify(reportFiltersValue(value));
  if (Buffer.byteLength(serialized, "utf8") > 100_000) {
    throw new DataApiError(400, "The saved report filters are too large.");
  }
  return serialized;
}
