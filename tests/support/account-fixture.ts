import type { Page } from "@playwright/test";
import type { PersistedAccount } from "../../src/lib/account-types";
import type { TimerState } from "../../src/lib/store/types";
import { initialPreferences, initialSettings, initialTrello } from "../../src/lib/store/defaults";
import { mergeAccountChanges } from "../../shared/account-merge.mjs";

export async function installAccountFixture(page: Page) {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const projectId = "22222222-2222-4222-8222-222222222222";
  const clientId = "33333333-3333-4333-8333-333333333333";
  const state = {
    account: null as PersistedAccount | null,
    timer: null as TimerState | null,
    timerReadFailures: 0,
    timerReadFailurePath: null as string | null,
    timerSaveFailures: 0,
    timerReads: 0,
    timerWrites: [] as TimerState[],
    accountSaveFailures: 0,
  };
  await page.route("**/api/data", async (route) => {
    const body = route.request().postDataJSON();
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (body.operation === "getAccountDeletionStatus")
      return reply({
        accountStatus: "active",
        legal: { accepted: true },
        deletion: null,
        ownershipBlockers: [],
      });
    if (body.operation === "loadAccount") {
      if (!state.account) {
        const token =
          route
            .request()
            .headers()
            ["authorization"]?.replace(/^Bearer /, "") ?? "";
        const userId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString())
          .sub as string;
        if (!userId) throw new Error("The QA token must identify the fixture user.");
        state.account = {
          version: 13,
          syncProtocol: 1,
          timerSyncProtocol: 1,
          identities: [
            { id: userId, name: "QA Fixture", email: "qa@example.test", initials: "QF" },
          ],
          preferencesByUserId: {
            [userId]: { ...initialPreferences, activeWorkspaceId: workspaceId },
          },
          workspaces: [
            {
              workspace: {
                id: workspaceId,
                name: "Recovery QA",
                ownerId: userId,
                logoDataUrl: null,
                status: "active",
                createdAt: "2026-10-01T00:00:00Z",
              },
              memberships: [
                {
                  workspaceId,
                  userId,
                  role: "Owner",
                  status: "active",
                  hourlyRate: 0,
                  currency: "BRL",
                },
              ],
              clients: [{ id: clientId, name: "Fixture client", contact: "", billable: false }],
              projects: [
                {
                  id: projectId,
                  name: "Fixture project",
                  clientId,
                  billable: false,
                  status: "active",
                  color: "bg-accent",
                  lastActivity: "2026-10-01",
                  memberIds: [userId],
                },
              ],
              entries: [
                {
                  id: "44444444-4444-4444-8444-444444444444",
                  userId,
                  projectId,
                  task: "E2E pending timer recovery",
                  date: "2026-10-01",
                  endDate: "2026-10-01",
                  start: "09:00",
                  end: "09:01",
                  seconds: 60,
                  billable: false,
                },
              ],
              settings: initialSettings,
              trello: initialTrello,
            },
          ],
        };
      }
      return reply(state.account);
    }
    if (body.operation === "syncAccount") {
      if (state.accountSaveFailures > 0) {
        state.accountSaveFailures -= 1;
        return route.fulfill({ status: 503, json: { error: "Temporary account save failure" } });
      }
      try {
        state.account = mergeAccountChanges(body.baseAccount, body.account, state.account);
      } catch {
        return route.fulfill({
          status: 409,
          json: { error: "Concurrent edit", code: "sync_conflict" },
        });
      }
      return reply(state.account);
    }
    if (body.operation === "getActiveTimer") {
      state.timerReads += 1;
      if (
        state.timerReadFailures > 0 &&
        (!state.timerReadFailurePath ||
          route.request().headers()["referer"]?.includes(state.timerReadFailurePath))
      ) {
        state.timerReadFailures -= 1;
        return route.fulfill({ status: 503, json: { error: "Temporary timer read failure" } });
      }
      return reply(state.timer);
    }
    if (body.operation === "saveActiveTimer") {
      if (state.timerSaveFailures > 0) {
        state.timerSaveFailures -= 1;
        return route.fulfill({ status: 503, json: { error: "Temporary timer save failure" } });
      }
      state.timer = body.timer as TimerState;
      state.timerWrites.push(structuredClone(state.timer));
      return reply(state.timer);
    }
    if (body.operation === "clearActiveTimer") {
      state.timer = null;
      return reply(null);
    }
    return reply([]);
  });
  return state;
}
