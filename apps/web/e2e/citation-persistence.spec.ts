import { expect, test, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The sources an answer cited have to survive a reload.
 *
 * Citations were written by the client alone, after the stream ended, by a save
 * whose failure handler was `console.error`. A non-retryable failure left an
 * answer whose text came back on reload while every source chip was gone, and
 * nothing said so. The server now records the cited pages in the same snapshot
 * that already carries the text, so the floor no longer depends on a browser
 * round trip completing.
 *
 * Written as a reload assertion rather than a mock: what matters is what is in
 * the row, and only reading it back through the product proves that.
 */
const CHAT_ROUTE = '/chat';
const COMPOSER_LABEL = /message input/i;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const STOP_BUTTON_LABEL = /stop the current response/i;
const APPROVE_ACTION = /^(approve|allow|allow once|run it)$/i;
const REVIEW_ROW = /Review Web Search action/i;
const SOURCES_CONTROL = /sources/i;

const LOAD_TIMEOUT_MS = 30_000;
const ANSWER_TIMEOUT_MS = 180_000;

async function dismissConsent(page: Page): Promise<void> {
  await page
    .getByLabel(CONSENT_DISMISS_LABEL)
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

test.describe.configure({ mode: 'serial' });

test('a cited answer still shows its sources after a reload', async ({ page }) => {
  test.slow();
  await signIn(page);
  await page.goto(CHAT_ROUTE, { waitUntil: 'domcontentloaded' });
  await dismissConsent(page);

  const composer = page.getByLabel(COMPOSER_LABEL);
  await expect(composer).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  await composer.click();
  await composer.fill('Search the web for the current Anthropic model lineup and cite your sources.');
  await composer.press('Enter');

  // Web search asks first now, so approve it before the turn can cite anything.
  const reviewRow = page.getByText(REVIEW_ROW).first();
  if (await reviewRow.isVisible({ timeout: 60_000 }).catch(() => false)) {
    await reviewRow.click();
    await page.getByRole('button', { name: APPROVE_ACTION }).first().click();
  }

  await expect(page.getByLabel(STOP_BUTTON_LABEL)).toBeHidden({ timeout: ANSWER_TIMEOUT_MS });
  const sourcesBefore = page.getByRole('button', { name: SOURCES_CONTROL }).first();
  await expect(sourcesBefore).toBeVisible({ timeout: ANSWER_TIMEOUT_MS });

  const conversationUrl = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(conversationUrl);

  await expect(page.getByRole('button', { name: SOURCES_CONTROL }).first()).toBeVisible({
    timeout: LOAD_TIMEOUT_MS,
  });
});
