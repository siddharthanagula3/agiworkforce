import { expect, test, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * A document attached in the composer must reach the model.
 *
 * Every unit along this path had a passing test while the whole of it was
 * broken: the composer uploaded, hydration built a `file` part, the wire
 * parser produced a `file` block, and the Chat Completions translator threw
 * for every one of them. It took a person attaching a .txt and reading "the
 * model failed to produce a response" to find it, so the regression test has
 * to be a person's path too, not another unit.
 *
 * The assertion is deliberately about the file's CONTENTS. A model that
 * answers politely without having seen the bytes is the failure this is
 * guarding against, and only a value that appears nowhere else can tell the
 * two apart.
 */
const CHAT_ROUTE = '/chat';
const COMPOSER_LABEL = /message input/i;
const FILE_INPUT_LABEL = 'File upload';
const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const STOP_BUTTON_LABEL = /stop the current response/i;

const LOAD_TIMEOUT_MS = 30_000;
const ANSWER_TIMEOUT_MS = 120_000;
const ATTACHMENT_SETTLE_MS = 3_000;

const SECRET_VALUE = 'ORANGE-77-QUOKKA';
const CSV_TOTAL = '1287';

test.describe.configure({ mode: 'serial' });

async function openChat(page: Page): Promise<void> {
  await signIn(page);
  await page.goto(CHAT_ROUTE, { waitUntil: 'domcontentloaded' });
  await page
    .getByLabel(CONSENT_DISMISS_LABEL)
    .click({ timeout: 5_000 })
    .catch(() => undefined);
  await expect(page.getByLabel(COMPOSER_LABEL)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
}

async function attachAndAsk(
  page: Page,
  file: { name: string; mimeType: string; body: string },
  prompt: string,
): Promise<string> {
  await page.getByLabel(FILE_INPUT_LABEL).setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: Buffer.from(file.body, 'utf8'),
  });
  await expect(page.getByText(file.name).first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  // The upload completes after the chip appears; sending before it resolves
  // posts a message with an asset id nothing has stored yet.
  await page.waitForTimeout(ATTACHMENT_SETTLE_MS);

  const composer = page.getByLabel(COMPOSER_LABEL);
  await composer.click();
  await composer.fill(prompt);
  await composer.press('Enter');

  return settledAnswer(page);
}

/**
 * The answer, once the turn has actually ended.
 *
 * Reading the bubble as soon as it appears returns the progress row, "Agent
 * working: Working", which contains no answer and is not an error either. The
 * stop control is the only unambiguous signal that generation has finished.
 */
async function settledAnswer(page: Page): Promise<string> {
  const assistant = page.locator(ASSISTANT_BUBBLE).last();
  await expect(assistant).toBeVisible({ timeout: ANSWER_TIMEOUT_MS });
  await expect(page.getByLabel(STOP_BUTTON_LABEL)).toBeHidden({ timeout: ANSWER_TIMEOUT_MS });
  await page.waitForTimeout(1_500);
  return assistant.innerText();
}

test.describe('document attachments reach the model', () => {
  test('answers from a plain text attachment', async ({ page }) => {
    await openChat(page);

    const answer = await attachAndAsk(
      page,
      {
        name: 'qa-secret-value.txt',
        mimeType: 'text/plain',
        body: `The stored access value is ${SECRET_VALUE}. Nothing else in this file matters.`,
      },
      'What value appears inside the attached file? Answer with the value only.',
    );

    expect(answer).toContain(SECRET_VALUE);
  });

  test('answers a calculation over a CSV attachment', async ({ page }) => {
    await openChat(page);

    const answer = await attachAndAsk(
      page,
      {
        name: 'qa-sales.csv',
        mimeType: 'text/csv',
        body: ['region,revenue', 'emea,412', 'apac,530', 'amer,345'].join('\n'),
      },
      'Add up the revenue column in the attached CSV. Reply with the total number only.',
    );

    expect(answer).toContain(CSV_TOTAL);
  });

  test('still describes an image attachment, the control that always worked', async ({ page }) => {
    await openChat(page);

    // A 16x16 solid blue PNG, generated rather than pasted: the pasted 1x1 in
    // the first draft of this test was green, and the model said so. The
    // control exists because "images work, documents do not" was the
    // observation that located the defect; a change that fixed documents by
    // breaking images would otherwise read as a pass.
    const bluePixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mOQ979BEmIY1TCqYfhqAACXPkYQrqnEggAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.getByLabel(FILE_INPUT_LABEL).setInputFiles({
      name: 'qa-blue.png',
      mimeType: 'image/png',
      buffer: bluePixel,
    });
    // An image attaches as a thumbnail with no filename beside it, unlike a
    // document, so the removal control is what proves it is staged.
    await expect(page.getByRole('button', { name: /remove/i }).first()).toBeVisible({
      timeout: LOAD_TIMEOUT_MS,
    });
    await page.waitForTimeout(ATTACHMENT_SETTLE_MS);

    const composer = page.getByLabel(COMPOSER_LABEL);
    await composer.click();
    await composer.fill('What colour is this image? Answer with one word.');
    await composer.press('Enter');

    expect(await settledAnswer(page)).toMatch(/blue/i);
  });
});
