const DEFAULT_AUTH_RETURN_PATH = "/tracker";

export function getAuthReturnPath(fallback = DEFAULT_AUTH_RETURN_PATH): string {
  if (typeof window === "undefined") return fallback;
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (
    !redirect ||
    !redirect.startsWith("/") ||
    Array.from(redirect).some((character) => character === "\\" || character.charCodeAt(0) <= 32)
  )
    return fallback;
  try {
    const target = new URL(redirect, window.location.origin);
    if (target.origin !== window.location.origin) return fallback;
    // Auth and lifecycle destinations would redirect back to themselves.
    if (
      [
        "/login",
        "/signup",
        "/auth/callback",
        "/legal-consent",
        "/account-deletion",
        "/forgot-password",
      ].includes(target.pathname.replace(/\/+$/, ""))
    )
      return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function getLoginPath(): string {
  if (typeof window === "undefined") return "/login";
  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/login?redirect=${encodeURIComponent(returnPath)}`;
}
