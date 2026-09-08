import { expect, test, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * A project's own composer must be able to start a conversation.
 *
 * That is what a project is for, and it failed on every project, on every
 * plan, every time: the composer send carried two fields the handoff schema
 * had never been told about, the schema was `.strict()`, and the resulting
 * `unrecognized_keys` became the toast "Could not open the project chat. Your
 * draft is still here." Nothing reached the server at all.
 *
 * The unit tests could not see it, because their fixture was hand-written from
 * the same stale field list as the schema. This walks the surface instead:
 * open a project, send, and require a real answer in a real conversation.
 */
const PROJECTS_ROUTE = '/chat/projects';
const COMPOSER_LABEL = /message input/i;
const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const USER_BUBBLE = '[data-role="user"]';
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const STOP_BUTTON_LABEL = /stop the current response/i;
const HANDOFF_FAILURE_TOAST = /could not open the project chat/i;

const LOAD_TIMEOUT_MS = 30_000;
const ANSWER_TIMEOUT_MS = 120_000;

const CANARY = 'MULBERRY-31';

test.describe.configure({ mode: 'serial' });

async function dismissConsent(page: Page): Promise<void> {
  await page
    .getByLabel(CONSENT_DISMISS_LABEL)
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

/**
 * Open the project at `index` on the Projects grid.
 *
 * The grid is the navigation path that behaves as expected; the sidebar row
 * attaches the project as context instead, which is a separate finding. Two
 * different projects are exercised because the defect was reproduced on both a
 * freshly created project and a long-existing one, which is what ruled out
 * per-project state corruption.
 */
async function openProject(page: Page, index: number): Promise<string> {
  await page.goto(PROJECTS_ROUTE, { waitUntil: 'domcontentloaded' });
  await dismissConsent(page);

  const card = page.getByRole('button', { name: /^Open project / }).nth(index);
  await expect(card).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  const name = (await card.getAttribute('aria-label')) ?? '';
  await card.click();

  await expect(page).toHaveURL(/\/chat\/projects\/[^/]+$/, { timeout: LOAD_TIMEOUT_MS });
  await expect(page.getByLabel(COMPOSER_LABEL)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  return name;
}

async function sendFromProject(page: Page, prompt: string): Promise<void> {
  const composer = page.getByLabel(COMPOSER_LABEL);
  await composer.click();
  await composer.fill(prompt);
  await composer.press('Enter');
}

/**
 * What the defect actually broke.
 *
 * `saveProjectChatHandoff` threw before anything left the browser, so no
 * conversation was created, no message was persisted and no request reached a
 * provider. These four assertions cover exactly that, and deliberately stop
 * short of asserting on the model's answer: whether a given route answers
 * depends on the account's provider settings, which is not what this test is
 * about. The attachment spec asserts on answer CONTENT, against a route it
 * pins.
 */
async function expectProjectConversationStarted(page: Page, prompt: string): Promise<void> {
  await expect(page.getByText(HANDOFF_FAILURE_TOAST)).toHaveCount(0);
  await expect(page).toHaveURL(/\/chat\?projectId=/, { timeout: LOAD_TIMEOUT_MS });

  await expect(page.locator(USER_BUBBLE).filter({ hasText: prompt }).first()).toBeVisible({
    timeout: LOAD_TIMEOUT_MS,
  });
  await expect(page.locator(ASSISTANT_BUBBLE).last()).toBeVisible({ timeout: ANSWER_TIMEOUT_MS });
  await expect(page.getByLabel(STOP_BUTTON_LABEL)).toBeHidden({ timeout: ANSWER_TIMEOUT_MS });
}

test.describe('starting a conversation inside a project', () => {
  test('the first message creates a conversation scoped to the project', async ({ page }) => {
    await signIn(page);
    await openProject(page, 0);

    const prompt = `Reply with exactly this word and nothing else: ${CANARY}`;
    await sendFromProject(page, prompt);
    await expectProjectConversationStarted(page, prompt);
  });

  test('a different project starts a conversation too', async ({ page }) => {
    await signIn(page);
    await openProject(page, 1);

    const prompt = 'What is 2+2? Reply with the number only.';
    await sendFromProject(page, prompt);
    await expectProjectConversationStarted(page, prompt);
  });
});
