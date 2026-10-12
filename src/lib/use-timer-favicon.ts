import { useEffect } from "react";
import type { TimerStatus } from "./store";

export function useTimerFavicon(status: TimerStatus) {
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) return;

    const originalHref = icon.getAttribute("href");
    icon.setAttribute(
      "href",
      status === "running" ? "/brand/trackify-mark-active.svg" : "/brand/trackify-mark.svg",
    );

    return () => {
      if (originalHref === null) icon.removeAttribute("href");
      else icon.setAttribute("href", originalHref);
    };
  }, [status]);
}
