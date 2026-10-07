import "@fontsource-variable/inter";
import "./styles.css";
import { migrateBrandStorage } from "./lib/brand-storage-migration";

migrateBrandStorage();

type BootLocale = "en-US" | "pt-BR";

type BootCopy = {
  loading: string;
  errorTitle: string;
  errorDescription: string;
  retry: string;
};

const bootCopy: Record<BootLocale, BootCopy> = {
  "en-US": {
    loading: "Loading Trackify…",
    errorTitle: "We couldn't open Trackify",
    errorDescription: "Try reloading the page. If the problem continues, check your connection.",
    retry: "Reload page",
  },
  "pt-BR": {
    loading: "Carregando o Trackify…",
    errorTitle: "Não conseguimos abrir o Trackify",
    errorDescription: "Tente recarregar a página. Se o problema continuar, confira sua conexão.",
    retry: "Recarregar página",
  },
};

function getBootLocale(): BootLocale {
  return document.documentElement.lang === "pt-BR" ? "pt-BR" : "en-US";
}

function showBootError(rootElement: HTMLElement, copy: BootCopy) {
  rootElement.replaceChildren();

  const screen = document.createElement("main");
  screen.className = "flex min-h-screen items-center justify-center p-4";
  screen.setAttribute("role", "alert");
  screen.setAttribute("aria-live", "assertive");

  const card = document.createElement("section");
  card.className = "flex w-full max-w-md flex-col items-center gap-3 p-6 text-center";
  card.setAttribute("aria-labelledby", "app-boot-error-title");

  const mark = document.createElement("img");
  mark.className = "size-12 object-contain";
  mark.src = "/brand/trackify-symbol.png";
  mark.alt = "";
  mark.setAttribute("aria-hidden", "true");

  const title = document.createElement("h1");
  title.id = "app-boot-error-title";
  title.textContent = copy.errorTitle;

  const description = document.createElement("p");
  description.textContent = copy.errorDescription;

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = copy.retry;
  retry.addEventListener("click", () => window.location.reload());

  card.append(mark, title, description, retry);
  screen.append(card);
  rootElement.append(screen);
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Trackify could not find the application root.");
}

const configuredAppUrl = import.meta.env["VITE_APP_URL"];
if (window.location.hostname === "127.0.0.1" && typeof configuredAppUrl === "string") {
  try {
    const appUrl = new URL(configuredAppUrl);
    if (appUrl.hostname === "localhost" && appUrl.port === window.location.port) {
      window.location.replace(
        `${appUrl.origin}${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    }
  } catch {
    // Keep the current origin when the optional app URL is invalid.
  }
}

const copy = bootCopy[getBootLocale()];
rootElement.querySelector<HTMLElement>("[role=status]")?.setAttribute("aria-label", copy.loading);

Promise.all([
  import("react"),
  import("react-dom/client"),
  import("@heroui/react"),
  import("@tanstack/react-router"),
  import("./router"),
  import("./lib/observability"),
])
  .then(async ([react, reactDom, heroui, routerLib, appRouter, observability]) => {
    const router = appRouter.getRouter();
    observability.initializeClientObservability(router);
    const appRoot = reactDom.createRoot(rootElement);

    appRoot.render(
      react.createElement(
        "main",
        {
          className: "flex min-h-screen items-center justify-center p-4",
        },
        react.createElement(heroui.Spinner, {
          size: "lg",
          "aria-label": copy.loading,
        }),
      ),
    );

    await router.load();
    appRoot.render(
      react.createElement(
        react.StrictMode,
        null,
        react.createElement(routerLib.RouterProvider, { router }),
      ),
    );
  })
  .catch((error) => {
    console.error(error);
    showBootError(rootElement, copy);
  });
