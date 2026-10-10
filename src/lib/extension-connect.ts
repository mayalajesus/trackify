export function parseExtensionConnectRequest(search: string, allowedIds: string) {
  const params = new URLSearchParams(search);
  const extensionId = params.get("extensionId") ?? "";
  const state = params.get("state") ?? "";
  const allowed = allowedIds
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!/^[a-p]{32}$/.test(extensionId) || !allowed.includes(extensionId)) return null;
  if (!/^[a-f0-9]{64}$/.test(state)) return null;
  return { extensionId, state };
}

type ExtensionRuntime = {
  lastError?: { message?: string };
  sendMessage: (
    id: string,
    message: Record<string, unknown>,
    callback: (response: { success?: boolean } | undefined) => void,
  ) => void;
};

export function sendExtensionSession(extensionId: string, message: Record<string, unknown>) {
  const runtime = (window as Window & { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime;
  if (!runtime?.sendMessage) return Promise.reject(new Error("Extension unavailable"));
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Extension timeout")), 30_000);
    runtime.sendMessage(extensionId, message, (response) => {
      window.clearTimeout(timeout);
      if (runtime.lastError || !response?.success) reject(new Error("Extension connection failed"));
      else resolve();
    });
  });
}
