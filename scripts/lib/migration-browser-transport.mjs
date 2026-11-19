import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { openArchive } from "./migration-archive.mjs";
import { targetRef } from "./migration-test-context.mjs";

const offlineContexts = new WeakSet();
const closingContexts = new WeakSet();
export async function migrationBrowserTransport() {
  const file = process.env.MIGRATION_HOSTED_STATE_FILE;
  if (!file) return { appOrigin: "http://localhost:5189", hosted: false };
  assert.match(file, /^backup\/migration-preparation\/hosted-[a-f0-9]+\.state\.enc$/);
  const env = parseEnv(await readFile(".env.backup.local", "utf8"));
  const { plaintext } = openArchive(
    await readFile(file),
    env.BACKUP_ENCRYPTION_PASSPHRASE,
    targetRef,
  );
  const state = JSON.parse(plaintext);
  plaintext.fill(0);
  assert.match(state.projectName, /^trackify-migration-app-[a-f0-9]+$/);
  assert.equal(state.hostOrigin, `https://${state.projectName}.vercel.app`);
  assert.ok([state.hostOrigin, "https://watchtag.vercel.app"].includes(state.appOrigin));
  assert.equal(state.targetRef, targetRef);
  assert.ok(Date.now() < state.expiresAt);
  return { ...state, hosted: true };
}

export async function routeMigrationContext(context, transport) {
  if (transport.hosted && transport.appOrigin === transport.hostOrigin) {
    // OAuth/email redirects create requests outside Playwright's first-request
    // route hook. Authorize this private host beforehand using Vercel's cookie.
    const response = await context.request.get(transport.hostOrigin + "/login", {
      headers: {
        "x-vercel-protection-bypass": transport.bypass,
        "x-vercel-set-bypass-cookie": "true",
      },
      maxRedirects: 0,
    });
    assert.ok([200, 302, 307].includes(response.status()));
    assert.ok(
      (await context.cookies(transport.hostOrigin)).length > 0,
      "Vercel bypass cookie required for Auth redirects",
    );
  }
  await context.route("**/*", async (route) => {
    try {
      const request = route.request(),
        url = new URL(request.url());
      if (offlineContexts.has(context)) return await route.abort("internetdisconnected");
      if (url.origin === `https://${targetRef}.supabase.co`) {
        if (
          transport.appOrigin !== transport.hostOrigin &&
          transport.hosted &&
          url.pathname === "/auth/v1/verify"
        )
          return await route.abort("blockedbyclient");
        return await route.continue();
      }
      if (url.origin !== transport.appOrigin) return await route.abort("blockedbyclient");
      if (!transport.hosted) return await route.continue();
      const headers = { ...request.headers(), "x-vercel-protection-bypass": transport.bypass };
      delete headers.host;
      if (transport.appOrigin === transport.hostOrigin) return await route.continue({ headers });
      // Browser-only rehearsal of the final origin. No request is sent to live production.
      url.protocol = new URL(transport.hostOrigin).protocol;
      url.host = new URL(transport.hostOrigin).host;
      const response = await route.fetch({
        url: url.href,
        headers,
        maxRedirects: 0,
        timeout: 45000,
      });
      await route.fulfill({ response });
    } catch (error) {
      // Closing a context cancels in-flight proxy requests. Keep the route
      // installed until closure so no final-origin request can escape it.
      if (!closingContexts.has(context)) {
        transport.proxyErrors ??= [];
        transport.proxyErrors.push({ name: error.name ?? "ProxyError" });
      }
      await route.abort("failed").catch(() => {});
    }
  });
}

export async function closeMigrationContext(context) {
  closingContexts.add(context);
  await context.close();
}

export async function openMigrationAuthLink(page, transport, link) {
  const url = new URL(link);
  assert.equal(url.origin, `https://${targetRef}.supabase.co`);
  assert.equal(url.pathname, "/auth/v1/verify");
  if (transport.appOrigin === transport.hostOrigin) return page.goto(link);
  // Never let a real HTTP redirect escape to the public production host.
  // Verify the genuine token, inspect the genuine Location, then start a fresh
  // browser navigation which is intercepted by the candidate-only proxy.
  const response = await fetch(link, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  assert.ok([302, 303].includes(response.status));
  const destination = new URL(response.headers.get("location"));
  assert.equal(destination.origin, transport.appOrigin);
  return page.goto(destination.href);
}

export async function setMigrationOffline(context, offline) {
  if (offline) offlineContexts.add(context);
  else offlineContexts.delete(context);
  await context.setOffline(offline);
}

export function migrationApiTarget(transport) {
  return {
    url: `${transport.hosted ? transport.hostOrigin : transport.appOrigin}/api/data`,
    headers: {
      origin: transport.appOrigin,
      ...(transport.hosted ? { "x-vercel-protection-bypass": transport.bypass } : {}),
    },
  };
}
