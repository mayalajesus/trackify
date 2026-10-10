import { DataApiError } from "./data-api-error.mjs";

export function isAllowedExtensionOrigin(origin, allowedIds = "") {
  const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
  return Boolean(
    match &&
    allowedIds
      .split(",")
      .map((id) => id.trim())
      .includes(match[1]),
  );
}

export function enforceExtensionOperation(origin, operation) {
  if (origin.startsWith("chrome-extension://") && operation !== "getExtensionSession") {
    throw new DataApiError(403, "This operation is not available to the extension.");
  }
}
