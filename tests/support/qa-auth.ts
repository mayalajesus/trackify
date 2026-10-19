import { expect, type Page } from "@playwright/test";
import fs from "node:fs";

export type QaRole = "owner" | "admin" | "member";

type QaCredentials = {
  email: string;
  password: string;
};

function localEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  } catch {
    // CI provides credentials through process.env.
  }
  return values;
}

const env = { ...localEnv(), ...process.env } as Record<string, string | undefined>;

export function qaCredentials(role: QaRole): QaCredentials {
  const prefix = role.toUpperCase();
  const email = env[`QA_${prefix}_EMAIL`];
  const password = env[`QA_${prefix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`QA credentials are missing for ${role}.`);
  }
  return { email, password };
}

export async function signInAs(page: Page, role: QaRole): Promise<void> {
  const credentials = qaCredentials(role);
  await page.goto("/login");
  await page.getByLabel(/^(Email|E-mail)\s*\*?$/).fill(credentials.email);
  await page.getByLabel(/^(Password|Senha)\s*\*?$/).fill(credentials.password);
  await page.getByRole("button", { name: /^(Sign in|Entrar)$/ }).click();
  // Real authentication and API calls have network deadlines up to 25 seconds.
  await expect(page).toHaveURL(/\/tracker(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
}

export async function openAppPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  // Assert the authenticated UI, rather than passing checks against a spinner
  // (for example, a forbidden button's absence before permissions load).
  await expect(page.locator("#main-content"), path).toBeVisible({ timeout: 30_000 });
}
