export const offlineMessage = "You are offline. Reconnect to the internet and try again.";
export const connectionMessage =
  "Unable to connect to the server. Check your connection and try again.";

export function networkErrorMessage(message: string): string {
  if (
    /^(?:TypeError:\s*)?(?:Failed to fetch|fetch failed|Load failed|Network request failed|NetworkError when attempting to fetch resource\.?)$/i.test(
      message.trim(),
    )
  ) {
    return typeof navigator !== "undefined" && navigator.onLine === false
      ? offlineMessage
      : connectionMessage;
  }
  return message;
}
