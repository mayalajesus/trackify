import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig, loadEnv } from "vite";
import { createDataMiddleware } from "./server/data-api.mjs";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sentryConfigured = Boolean(
    env["SENTRY_AUTH_TOKEN"] && env["SENTRY_ORG"] && env["SENTRY_PROJECT"],
  );
  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      {
        name: "trackify-data-api",
        configureServer(server) {
          server.middlewares.use("/api/data", createDataMiddleware(env));
        },
      },
      ...(sentryConfigured
        ? [
            sentryVitePlugin({
              authToken: env["SENTRY_AUTH_TOKEN"]!,
              org: env["SENTRY_ORG"]!,
              project: env["SENTRY_PROJECT"]!,
              ...(env["VERCEL_GIT_COMMIT_SHA"]
                ? { release: { name: env["VERCEL_GIT_COMMIT_SHA"] } }
                : {}),
              sourcemaps: { filesToDeleteAfterUpload: "./dist/**/*.map" },
              telemetry: false,
            }),
          ]
        : []),
    ],
    build: { sourcemap: sentryConfigured ? "hidden" : false },
  };
});
