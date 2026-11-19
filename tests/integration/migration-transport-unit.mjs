import assert from "node:assert/strict";
import { test } from "node:test";
import {
  routeMigrationContext,
  setMigrationOffline,
  migrationApiTarget,
  openMigrationAuthLink,
  closeMigrationContext,
} from "../../scripts/lib/migration-browser-transport.mjs";

const transport = {
  hosted: true,
  appOrigin: "https://watchtag.vercel.app",
  hostOrigin: "https://trackify-migration-app-abcdef.vercel.app",
  bypass: "test-only",
};
async function harness(fetchError = false) {
  const scopedTransport = { ...transport, proxyErrors: [] };
  let handler;
  const context = {
    route: async (_, callback) => {
      handler = callback;
    },
    setOffline: async () => {},
  };
  await routeMigrationContext(context, scopedTransport);
  const events = [];
  const request = (url) =>
    handler({
      request: () => ({
        url: () => url,
        headers: () => ({ host: "watchtag.vercel.app", origin: transport.appOrigin }),
      }),
      abort: async (reason) => events.push({ abort: reason }),
      continue: async (options) => events.push({ continue: options ?? true }),
      fetch: async (options) => {
        events.push({ fetch: options });
        if (fetchError) throw new Error("Synthetic proxy failure");
        return "candidate-response";
      },
      fulfill: async (options) => events.push({ fulfill: options }),
    });
  return { context, events, request, transport: scopedTransport };
}
test("final-origin rehearsal only fetches the isolated candidate and retains the real Origin check", async () => {
  const h = await harness();
  await h.request(transport.appOrigin + "/api/data");
  assert.equal(h.events[0].fetch.url, transport.hostOrigin + "/api/data");
  assert.equal(h.events[0].fetch.headers.origin, transport.appOrigin);
  assert.equal(h.events[0].fetch.headers.host, undefined);
  assert.equal(h.events[0].fetch.headers["x-vercel-protection-bypass"], "test-only");
  assert.equal(h.events[0].fetch.maxRedirects, 0);
  assert.equal(migrationApiTarget(transport).url, transport.hostOrigin + "/api/data");
});

test("closing a proxied context keeps production blocked and absorbs only closure errors", async () => {
  const h = await harness(true);
  h.context.close = () => h.request(transport.appOrigin + "/api/data");
  await closeMigrationContext(h.context);
  assert.equal(h.events[0].fetch.url, transport.hostOrigin + "/api/data");
  assert.deepEqual(h.events.at(-1), { abort: "failed" });
  assert.deepEqual(h.transport.proxyErrors, []);
  const active = await harness(true);
  await active.request(transport.appOrigin + "/api/data");
  assert.deepEqual(active.transport.proxyErrors, [{ name: "Error" }]);
  assert.deepEqual(active.events.at(-1), { abort: "failed" });
});
test("old backend and unrelated hosts are blocked; bypass secret never reaches Supabase", async () => {
  const h = await harness();
  await h.request("https://qgqwvyprivwvffuewzmp.supabase.co/auth/v1/token");
  await h.request("https://unrelated.example/api/data");
  await h.request("https://gfedmrhckghmgssgfwis.supabase.co/auth/v1/token");
  assert.deepEqual(h.events, [
    { abort: "blockedbyclient" },
    { abort: "blockedbyclient" },
    { continue: true },
  ]);
});
test("offline simulation blocks the proxy as well as browser network requests", async () => {
  const h = await harness();
  await setMigrationOffline(h.context, true);
  await h.request(transport.appOrigin + "/api/data");
  assert.deepEqual(h.events, [{ abort: "internetdisconnected" }]);
  await setMigrationOffline(h.context, false);
  await h.request(transport.appOrigin + "/api/data");
  assert.ok(h.events[1].fetch);
});

test("final-origin Auth verification never follows a redirect to public production", async () => {
  const h = await harness();
  await h.request("https://gfedmrhckghmgssgfwis.supabase.co/auth/v1/verify?token=synthetic");
  assert.deepEqual(h.events, [{ abort: "blockedbyclient" }]);
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(null, {
      status: 303,
      headers: { location: transport.appOrigin + "/auth/callback#synthetic" },
    });
  };
  try {
    let navigation;
    await openMigrationAuthLink(
      {
        goto: async (url) => {
          navigation = url;
        },
      },
      transport,
      "https://gfedmrhckghmgssgfwis.supabase.co/auth/v1/verify?token=synthetic",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, "manual");
    assert.equal(new URL(calls[0].url).host, "gfedmrhckghmgssgfwis.supabase.co");
    assert.equal(navigation, transport.appOrigin + "/auth/callback#synthetic");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
