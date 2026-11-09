// Run one inbox request at a time. A response started before the tab was
// hidden or disconnected must not reopen an outdated invitation on return.
export function watchTaskInvitations(
  load: (isCurrent: () => boolean) => Promise<number | undefined>,
  clear: () => void,
) {
  let disposed = false;
  let generation = 0;
  let inFlight = false;
  let timeout: number | undefined;
  let retryAt = 0;
  const visible = () => document.visibilityState === "visible" && navigator.onLine;

  const refresh = async () => {
    window.clearTimeout(timeout);
    if (disposed || !visible() || inFlight) return;
    if (retryAt > Date.now()) {
      timeout = window.setTimeout(refresh, retryAt - Date.now());
      return;
    }
    inFlight = true;
    const started = generation;
    try {
      const retrySeconds = await load(() => !disposed && started === generation);
      if (retrySeconds) retryAt = Date.now() + retrySeconds * 1000;
    } catch {
      if (!disposed && started === generation) clear();
    } finally {
      inFlight = false;
      if (!disposed && visible()) {
        timeout = window.setTimeout(refresh, started === generation ? 5000 : 0);
      }
    }
  };
  const wake = () => {
    if (visible()) void refresh();
    else {
      generation++;
      window.clearTimeout(timeout);
      clear();
    }
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  window.addEventListener("offline", wake);
  wake();
  return () => {
    disposed = true;
    window.clearTimeout(timeout);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", wake);
  };
}
