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
 *
 * Every allowlisted document type is covered here because the translator threw
 * per block type, not per upload: .txt passing said nothing about .md or
 * .json, which `chat-attachments.ts` allows and the composer will accept.
 *
 * The route headers are read for the same reason. A turn that quietly fell
 * back to another model can still answer with the file's contents, so "it
 * worked" and "it worked over the route we chose" are different readings and
 * only the second one says the provider-direct path carried the attachment.
 */
const CHAT_ROUTE = '/chat';
const COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
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
const MARKDOWN_VALUE = 'INDIGO-41-NUMBAT';
const JSON_VALUE = 'VIOLET-93-BILBY';

const FALLBACK_REASON_HEADER = 'x-agi-fallback-reason';
const MOVED_FROM_MODEL_HEADER = 'x-agi-moved-from-model';
const RESOLVED_MODEL_HEADER = 'x-agi-resolved-model';
const UNROUTED_MODEL_ALIASES = ['auto', 'auto-economy', 'auto-balanced', 'auto-premium'];

interface TurnResult {
  readonly answer: string;
  readonly headers: Record<string, string>;
}

/**
 * The turn was served by the route the router picked, over a direct provider
 * call. A fallback reason or a moved-from model is the router saying it landed
 * somewhere else, and an alias in the resolved-model header is it saying the
 * turn never resolved to a concrete route at all.
 */
function expectProviderDirect(headers: Record<string, string>): void {
  expect(headers[FALLBACK_REASON_HEADER], 'the turn fell back to another route').toBeUndefined();
  expect(headers[MOVED_FROM_MODEL_HEADER], 'the turn was moved off its model').toBeUndefined();
  const resolved = headers[RESOLVED_MODEL_HEADER];
  expect(resolved, 'no resolved model was reported').toBeTruthy();
  expect(UNROUTED_MODEL_ALIASES).not.toContain(resolved);
}

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
): Promise<TurnResult> {
  await page.getByLabel(FILE_INPUT_LABEL).setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: Buffer.from(file.body, 'utf8'),
  });
  await expect(page.getByText(file.name).first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  // The upload completes after the chip appears; sending before it resolves
  // posts a message with an asset id nothing has stored yet.
  await page.waitForTimeout(ATTACHMENT_SETTLE_MS);

  const completion = page.waitForResponse(
    (response) =>
      response.url().includes(COMPLETIONS_PATH) && response.request().method() === 'POST',
    { timeout: ANSWER_TIMEOUT_MS },
  );

  const composer = page.getByLabel(COMPOSER_LABEL);
  await composer.click();
  await composer.fill(prompt);
  await composer.press('Enter');

  const response = await completion;
  // Read the body only on a failure: this response streams, so `text()` on a
  // healthy turn would sit here until generation ends.
  if (response.status() !== 200) {
    const body = await response.text().catch(() => 'unreadable body');
    throw new Error(`${COMPLETIONS_PATH} answered ${response.status()}: ${body.slice(0, 400)}`);
  }

  return { answer: await settledAnswer(page), headers: response.headers() };
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

    const { answer, headers } = await attachAndAsk(
      page,
      {
        name: 'qa-secret-value.txt',
        mimeType: 'text/plain',
        body: `The stored access value is ${SECRET_VALUE}. Nothing else in this file matters.`,
      },
      'What value appears inside the attached file? Answer with the value only.',
    );

    expect(answer).toContain(SECRET_VALUE);
    expectProviderDirect(headers);
  });

  test('answers from a markdown attachment', async ({ page }) => {
    await openChat(page);

    // Headings and a fenced block, because the markdown path has to survive
    // whatever the renderer does to the text before it becomes a file part.
    const { answer, headers } = await attachAndAsk(
      page,
      {
        name: 'qa-runbook.md',
        mimeType: 'text/markdown',
        body: [
          '# QA runbook',
          '',
          '## Access',
          '',
          `The rotation token is \`${MARKDOWN_VALUE}\`.`,
          '',
          '```bash',
          'echo "nothing here matters"',
          '```',
        ].join('\n'),
      },
      'What is the rotation token in the attached markdown file? Answer with the token only.',
    );

    expect(answer).toContain(MARKDOWN_VALUE);
    expectProviderDirect(headers);
  });

  test('answers from a nested value in a JSON attachment', async ({ page }) => {
    await openChat(page);

    // Nested rather than top level: a reader that only skims the first keys
    // would answer from the decoys and never reach the value under test.
    const { answer, headers } = await attachAndAsk(
      page,
      {
        name: 'qa-config.json',
        mimeType: 'application/json',
        body: JSON.stringify(
          {
            service: 'qa-fixture',
            regions: ['emea', 'apac'],
            credentials: { rotation: { token: JSON_VALUE, rotatedOn: '2026-09-18' } },
          },
          null,
          2,
        ),
      },
      'In the attached JSON, what is credentials.rotation.token? Answer with the value only.',
    );

    expect(answer).toContain(JSON_VALUE);
    expectProviderDirect(headers);
  });

  test('answers a calculation over a CSV attachment', async ({ page }) => {
    await openChat(page);

    const { answer, headers } = await attachAndAsk(
      page,
      {
        name: 'qa-sales.csv',
        mimeType: 'text/csv',
        body: ['region,revenue', 'emea,412', 'apac,530', 'amer,345'].join('\n'),
      },
      'Add up the revenue column in the attached CSV. Reply with the total number only.',
    );

    expect(answer).toContain(CSV_TOTAL);
    expectProviderDirect(headers);
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
