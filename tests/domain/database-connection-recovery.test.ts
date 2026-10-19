import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  load: vi.fn(),
  sync: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../../server/data/connections.mjs", async (original) => ({
  ...(await original<object>()),
  getPool: () => ({ connect: async () => ({ query: mocks.query, release: mocks.release }) }),
}));
vi.mock("../../server/authentication.mjs", () => ({
  authenticateDataRequest: async () => ({ id: "user", name: "QA User", email: "qa@example.test" }),
}));
vi.mock("../../server/extension-sessions.mjs", async (original) => ({
  ...(await original<object>()),
  authenticateExtension: async () => null,
}));
vi.mock("../../server/data/profile.mjs", () => ({ ensureProfile: async () => undefined }));
vi.mock("../../server/data/account.mjs", () => ({ loadAccount: mocks.load }));
vi.mock("../../server/data/account-sync.mjs", () => ({ synchronizeAccount: mocks.sync }));
vi.mock("../../server/rate-limit.mjs", async (original) => ({
  ...(await original<object>()),
  enforceUserRateLimits: async () => undefined,
}));
vi.mock("../../server/account-lifecycle.mjs", async (original) => ({
  ...(await original<object>()),
  enforceAccountLifecycle: async () => undefined,
}));

import { handleDataRequest } from "../../server/data-api.mjs";
import { DataApiError } from "../../server/data-api-error.mjs";

describe("database connection recovery", () => {
  it.each([
    { error: new Error("Query read timeout"), rollback: false },
    { error: new DataApiError(403, "Access denied"), rollback: true },
  ])(
    "recovers a failed transaction without queuing rollback on a stalled socket: $rollback",
    async ({ error, rollback }) => {
      mocks.release.mockClear();
      mocks.query.mockReset().mockResolvedValue({ rows: [] });
      mocks.sync.mockRejectedValueOnce(error);
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
      try {
        await handleDataRequest(
          { method: "POST", headers: {}, body: { operation: "syncAccount" } },
          response,
          {
            DATABASE_PROVIDER: "neon",
            DATABASE_URL: "postgres://unused",
            APP_URL: "https://app.example",
          },
        );
        expect(mocks.query).toHaveBeenCalledWith("begin isolation level serializable");
        expect(mocks.query.mock.calls.some(([sql]) => sql === "rollback")).toBe(rollback);
        expect(mocks.release).toHaveBeenCalledWith(!rollback);
        expect(response.statusCode).toBe(rollback ? 403 : 500);
      } finally {
        log.mockRestore();
      }
    },
  );
  it.each([
    { error: new Error("Query read timeout"), discarded: true, status: 500 },
    { error: new DataApiError(403, "Access denied"), discarded: false, status: 403 },
  ])(
    "releases a failed request with discarded=$discarded",
    async ({ error, discarded, status }) => {
      mocks.release.mockClear();
      mocks.load.mockRejectedValueOnce(error);
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      let body = "";
      const response = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: (value: string) => {
          body = value;
        },
      };
      try {
        await handleDataRequest(
          { method: "POST", headers: {}, body: { operation: "loadAccount" } },
          response,
          {
            DATABASE_PROVIDER: "neon",
            DATABASE_URL: "postgres://unused",
            APP_URL: "https://app.example",
          },
        );
        expect(response.statusCode).toBe(status);
        expect(mocks.release).toHaveBeenCalledWith(discarded);
        if (discarded) expect(body).not.toContain("Query read timeout");
      } finally {
        log.mockRestore();
      }
    },
  );
});
