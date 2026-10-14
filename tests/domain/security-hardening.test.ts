import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  handleDataRequest,
  readBody,
  syncEntries,
  upsertOwnEntry,
} from "../../server/data-api.mjs";

const dataApi = [
  readFileSync(new URL("../../server/data-api.mjs", import.meta.url), "utf8"),
  ...readdirSync(new URL("../../server/data/", import.meta.url))
    .filter((name) => name.endsWith(".mjs"))
    .sort()
    .map((name) => readFileSync(new URL(`../../server/data/${name}`, import.meta.url), "utf8")),
].join("\n");
const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { dependencies: Record<string, string> };
const gitignore = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");

describe("production security hardening", () => {
  const userId = "security-user";
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const entryId = "22222222-2222-4222-8222-222222222222";
  const ownEntry = {
    id: entryId,
    userId,
    date: "2026-09-01",
    start: "09:00",
    end: "10:00",
    seconds: 3600,
    projectId: null,
    task: "Security test",
    billable: true,
    currency: "BRL",
  };

  it("keeps mutable records scoped to their workspace and entry owner", () => {
    expect(dataApi).toContain("where clients.workspace_id = excluded.workspace_id");
    expect(dataApi).toContain("where projects.workspace_id = excluded.workspace_id");
    expect(dataApi).toContain("where time_entries.workspace_id = excluded.workspace_id");
    expect(dataApi).toContain("and time_entries.user_id = excluded.user_id");
    expect(dataApi).toMatch(
      /delete from public\.time_entries[\s\S]*workspace_id = \$1 and user_id = \$2/i,
    );
    expect(dataApi).not.toMatch(
      /delete from public\.time_entries where workspace_id = \$1 and not \(id = any/i,
    );
  });

  it("requires accepted invitations for new workspace members", () => {
    expect(dataApi).toContain(
      "New workspace members must accept a valid invitation before they become active.",
    );
  });

  it("routes workspace creation through the dedicated rate-limited operation", () => {
    expect(dataApi).toContain("Create new workspaces with the createWorkspace operation.");
    expect(dataApi).toContain("minvio:workspace-create:");
  });

  it("synchronizes only the authenticated user's entries", async () => {
    const query = vi.fn(async (sql: string, _values?: unknown[]) => ({
      rowCount: sql.startsWith("select 1 from public.task_invitations") ? 0 : 1,
    }));
    await syncEntries({ query }, userId, workspaceId, [
      ownEntry,
      {
        ...ownEntry,
        id: "33333333-3333-4333-8333-333333333333",
        userId: "another-user",
      },
    ]);

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0]?.[1]).toEqual([workspaceId, userId, [entryId]]);
    expect(query.mock.calls[2]?.[0]).toContain("time_entries.user_id = excluded.user_id");
    expect(query.mock.calls[2]?.[1]?.slice(0, 3)).toEqual([entryId, workspaceId, userId]);
    expect(query.mock.calls[3]?.[1]).toEqual([workspaceId, userId]);
  });

  it("rejects an entry identifier already owned by another scope", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    await expect(
      upsertOwnEntry({ query }, userId, workspaceId, ownEntry, entryId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("limits request bodies and hides unexpected server errors", () => {
    expect(dataApi).toContain("MAX_REQUEST_BODY_BYTES");
    expect(dataApi).toContain("The request body is too large.");
    expect(dataApi).toContain("The data service is temporarily unavailable. Please try again.");
  });

  it("enforces the body limit and returns a generic server failure", async () => {
    await expect(
      readBody({ headers: { "content-length": String(4 * 1024 * 1024 + 1) } }),
    ).rejects.toMatchObject({ status: 413 });

    const headers = new Map<string, string>();
    let payload = "";
    const response = {
      statusCode: 0,
      setHeader: (key: string, value: string) => headers.set(key, value),
      end: (value = "") => {
        payload = value;
      },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await handleDataRequest(
      {
        method: "POST",
        headers: { authorization: "Bearer invalid", "content-type": "application/json" },
        body: {},
      },
      response,
      {},
    );
    log.mockRestore();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(payload)).toMatchObject({
      error: "The data service is temporarily unavailable. Please try again.",
    });
    expect(JSON.parse(payload).requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(headers.get("x-request-id")).toBe(JSON.parse(payload).requestId);
  });

  it("rejects browser requests from an origin different from APP_URL", async () => {
    const headers = new Map<string, string>();
    let payload = "";
    const response = {
      statusCode: 0,
      setHeader: (key: string, value: string) => headers.set(key, value),
      end: (value = "") => {
        payload = value;
      },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await handleDataRequest(
      {
        method: "POST",
        headers: {
          origin: "https://malicious.example",
          "content-type": "application/json",
        },
        body: { operation: "loadAccount" },
      },
      response,
      { APP_URL: "https://app.example" },
    );
    log.mockRestore();

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(payload)).toMatchObject({
      code: "invalid_origin",
      error: "This request origin is not allowed.",
    });
    expect(headers.get("x-request-id")).toBeTruthy();
  });

  it("sets browser isolation and anti-injection headers", () => {
    const globalHeaders = vercel.headers.find((entry) => entry.source === "/(.*)")?.headers ?? [];
    const values = new Map(globalHeaders.map((header) => [header.key, header.value]));
    expect(values.get("X-Frame-Options")).toBe("DENY");
    expect(values.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(values.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(values.get("Content-Security-Policy")).toContain("object-src 'none'");
  });

  it("keeps environment files out of git and removes the vulnerable Excel package", () => {
    expect(gitignore).toContain(".env*");
    expect(gitignore).toContain("!.env.example");
    expect(packageJson.dependencies).not.toHaveProperty("xlsx");
    expect(packageJson.dependencies).toHaveProperty("write-excel-file");
  });
});
