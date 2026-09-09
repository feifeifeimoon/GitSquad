import { type Page } from "@playwright/test";
import { TestApiClient } from "./fixtures";

/**
 * Inject the E2E user's JWT into localStorage before the app loads. The
 * console layout reads the token from localStorage on mount, so this makes the
 * browser session authenticated without any OAuth UI.
 */
export async function loginAsE2E(page: Page, api: TestApiClient): Promise<void> {
  await page.addInitScript((token) => {
    localStorage.setItem("gitsquad_token", token);
  }, api.getToken());
}

/** Wait until the given text is present anywhere in the document body. */
export async function waitForText(
  page: Page,
  text: string,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (expected) => document.body?.innerText.includes(expected),
    text,
    { timeout },
  );
}
