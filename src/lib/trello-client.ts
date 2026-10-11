export type TrelloBoard = { id: string; name: string };
export type TrelloCard = { id: string; name: string; shortUrl: string; idList: string };
const key = import.meta.env["VITE_TRELLO_API_KEY"] ?? "";
let token = "";
let tokenUser = "";
export const trelloConfigured = Boolean(key);
export function resetTrelloSession(userId: string) {
  if (tokenUser !== userId) {
    token = "";
    tokenUser = userId;
  }
}
export function authorizeTrello(): Promise<void> {
  if (!key) return Promise.reject(new Error("Trello is not configured yet."));
  const url = new URL("https://trello.com/1/authorize");
  url.search = new URLSearchParams({
    key,
    name: "Trackify",
    scope: "read",
    expiration: "1day",
    response_type: "token",
    callback_method: "postMessage",
    return_url: window.location.origin,
  }).toString();
  const popup = window.open(url.toString(), "trackify-trello", "width=650,height=720");
  if (!popup) return Promise.reject(new Error("Allow popups to connect Trello."));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", listener);
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      popup.close();
    };
    const listener = (event: MessageEvent) => {
      if (event.origin !== "https://trello.com" || event.source !== popup) return;
      if (typeof event.data === "string" && /^[a-zA-Z0-9]{32,256}$/.test(event.data)) {
        token = event.data;
        cleanup();
        resolve();
      } else {
        cleanup();
        reject(new Error("Trello authorization was not completed."));
      }
    };
    window.addEventListener("message", listener);
    const poll = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Trello authorization was not completed."));
      }
    }, 500);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Trello authorization timed out."));
    }, 180000);
  });
}
export async function trelloRequest<T>(path: string): Promise<T> {
  if (!token) throw new Error("Connect Trello to select a card.");
  const response = await fetch(`https://api.trello.com/1/${path}`, {
    headers: { Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"` },
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 401) {
    token = "";
    throw new Error("Connect Trello again.");
  }
  if (!response.ok) throw new Error("Could not load Trello data.");
  return response.json() as Promise<T>;
}
