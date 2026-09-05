import { expect, test, type Locator, type Page } from '@playwright/test';

import { installSseChatMock, type SseChatMock } from './lib/sse-chat-mock';
import { signIn } from './qa-capability-harness';

/**
 * In-thread response variants, driven in a real browser because the behaviours
 * that break here are the ones jsdom has no equivalent of: react-window's
 * index-keyed height cache, scroll anchoring after the visible path is swapped,
 * and whether a control is genuinely reachable in the action row.
 */

const CHAT_ROUTE = '/chat';
const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

const SPEC_TIMEOUT_MS = 10 * 60_000;
const LOAD_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 60_000;
const DONE_SETTLE_MS = 1_200;
const SCROLL_SETTLE_MS = 900;
const CONSENT_WAIT_MS = 6_000;
const ZERO = 0;

const MESSAGE_VARIANTS_STORAGE_KEY = 'agi.message-variants';
const MESSAGE_VARIANTS_ON = 'on';
const MESSAGE_VARIANTS_OFF = 'off';

const COMPOSER_LABEL = /message input/i;
const STOP_BUTTON_LABEL = /stop the current response/i;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const REGENERATE_LABEL = 'Regenerate response';
const REGENERATE_NOW_LABEL = 'Try again';
const PREVIOUS_VARIANT_LABEL = 'Previous response';
const NEXT_VARIANT_LABEL = 'Next response';
const EDIT_BUTTON_LABEL = 'Edit message';
const EDIT_SAVE_LABEL = 'Save & Retry';
const EDIT_PLACEHOLDER = 'Edit your message...';

const VARIANT_PAGER_TESTID = 'variant-pager';
const TRANSCRIPT_LIST_TESTID = 'chat-message-list';
const TRANSCRIPT_SCROLLER = '[role="log"][aria-label="Chat messages"]';
const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const USER_BUBBLE = '[data-role="user"]';
const MESSAGE_TEXT = '.message-text';

const CONVERSATION_URL_PATTERN = /\/chat\/[0-9a-f-]{36}/i;
const ERROR_TEXT_PATTERN = /something went wrong|application error/i;

const FIRST_PROMPT = 'What is the capital of France';
const FIRST_ANSWER = 'Paris is the capital of France.';
const SECOND_ANSWER = 'The capital of France is Paris, on the Seine.';
const THIRD_ANSWER = 'France is governed from Paris.';
const FOLLOW_UP_PROMPT = 'And its population';
const FOLLOW_UP_ANSWER = 'Roughly 2.1 million people live in the city proper.';
const EDITED_PROMPT = 'What is the capital of Japan';
const EDITED_ANSWER = 'Tokyo is the capital of Japan.';

// The pager renders the visible counter beside an sr-only live region reading
// "Response N of M", so its subtree text is the counter plus that sentence.
// These are matched as substrings, the same discipline VariantPager.test.tsx
// uses; an exact match here asserts the live region does not exist.
const PAGER_FIRST_OF_TWO = '1/2';
const PAGER_SECOND_OF_TWO = '2/2';
const PAGER_THIRD_OF_THREE = '3/3';

const PADDING_TURN_COUNT = 8;
const SCROLL_DRIFT_ALLOWANCE_PX = 4;

function paddingPrompt(index: number): string {
  return `Padding question ${index + 1}`;
}

function paddingAnswer(index: number): string {
  return Array.from(
    { length: 6 },
    (_, line) =>
      `Padding answer ${index + 1}, paragraph ${line + 1}. This paragraph exists to give the transcript enough height that a virtualized row can be measured and mis-measured.`,
  ).join('\n\n');
}

function assistantBubbles(page: Page): Locator {
  return page.locator(ASSISTANT_BUBBLE);
}

function lastAssistantProse(page: Page): Locator {
  return assistantBubbles(page).last().locator(MESSAGE_TEXT);
}

function pagerOn(bubble: Locator): Locator {
  return bubble.getByTestId(VARIANT_PAGER_TESTID);
}

async function dismissConsent(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: CONSENT_DISMISS_LABEL })
    .click({ timeout: CONSENT_WAIT_MS })
    .catch(() => undefined);
}

/**
 * The gate reads localStorage before the first paint, and the first send
 * navigates away from whatever query string the test opened, so the stored
 * override is the only one that survives the whole run.
 */
async function openChat(page: Page, mode = MESSAGE_VARIANTS_ON): Promise<SseChatMock> {
  const mock = await installSseChatMock(page);
  await page.addInitScript(
    (input: { key: string; value: string }) => {
      try {
        window.localStorage.setItem(input.key, input.value);
      } catch {
        // A browser that refuses storage falls back to the build default, which
        // the assertions below would report as a missing pager.
      }
    },
    { key: MESSAGE_VARIANTS_STORAGE_KEY, value: mode },
  );
  await signIn(page);
  await page.goto(CHAT_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
  await expect(page.getByRole('textbox', { name: COMPOSER_LABEL }).first()).toBeEditable({
    timeout: LOAD_TIMEOUT_MS,
  });
  await dismissConsent(page);
  return mock;
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const composer = page.getByRole('textbox', { name: COMPOSER_LABEL }).first();
  await expect(composer).toBeEditable({ timeout: LOAD_TIMEOUT_MS });
  await composer.fill(prompt);
  await composer.press('Enter');
}

async function settleStream(page: Page, mock: SseChatMock): Promise<void> {
  await mock.finish();
  await expect(page.getByRole('button', { name: STOP_BUTTON_LABEL })).toHaveCount(ZERO, {
    timeout: STREAM_TIMEOUT_MS,
  });
  await page.waitForTimeout(DONE_SETTLE_MS);
}

async function runTurn(
  page: Page,
  mock: SseChatMock,
  prompt: string,
  answer: string,
): Promise<void> {
  const before = await mock.requestCount();
  await sendPrompt(page, prompt);
  await mock.waitForRequest(before);
  await mock.push(answer);
  await settleStream(page, mock);
}

/** Regenerate the last answer and let the replacement stream to completion. */
async function regenerateLast(page: Page, mock: SseChatMock, answer: string): Promise<void> {
  const before = await mock.requestCount();
  await assistantBubbles(page).last().getByRole('button', { name: REGENERATE_LABEL }).click();
  await page
    .getByRole('menuitem', { name: REGENERATE_NOW_LABEL, exact: true })
    .click({ timeout: 10_000 });
  await mock.waitForRequest(before);
  await mock.push(answer);
  await settleStream(page, mock);
}

async function readScrollTop(page: Page): Promise<number> {
  return page.evaluate((selector: string) => {
    const scroller = document.querySelector(selector) as HTMLElement | null;
    return scroller ? Math.round(scroller.scrollTop) : -1;
  }, TRANSCRIPT_SCROLLER);
}

async function readTranscript(page: Page): Promise<string[]> {
  return page.locator(MESSAGE_TEXT).allInnerTexts();
}

test.describe('in-thread response variants', () => {
  test.setTimeout(SPEC_TIMEOUT_MS);
  test.use({ reducedMotion: 'reduce', viewport: DESKTOP_VIEWPORT } as never);

  test('regenerating keeps the previous answer and pages between the two', async ({ page }) => {
    const mock = await openChat(page);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await expect(page).toHaveURL(CONVERSATION_URL_PATTERN, { timeout: LOAD_TIMEOUT_MS });
    await expect(pagerOn(assistantBubbles(page).last())).toHaveCount(ZERO);

    await regenerateLast(page, mock, SECOND_ANSWER);

    // The replacement is on screen and it is the only answer on screen: the
    // first one is behind the pager, not below it.
    await expect(lastAssistantProse(page)).toContainText(SECOND_ANSWER);
    await expect(assistantBubbles(page)).toHaveCount(1);
    const pager = pagerOn(assistantBubbles(page).last());
    await expect(pager).toContainText(PAGER_SECOND_OF_TWO);

    await pager.getByRole('button', { name: PREVIOUS_VARIANT_LABEL }).click();
    await expect(lastAssistantProse(page)).toContainText(FIRST_ANSWER);
    await expect(pagerOn(assistantBubbles(page).last())).toContainText(PAGER_FIRST_OF_TWO);
    await expect(
      pagerOn(assistantBubbles(page).last()).getByRole('button', { name: PREVIOUS_VARIANT_LABEL }),
    ).toBeDisabled();

    await pagerOn(assistantBubbles(page).last())
      .getByRole('button', { name: NEXT_VARIANT_LABEL })
      .click();
    await expect(lastAssistantProse(page)).toContainText(SECOND_ANSWER);
    await expect(page.getByTestId(TRANSCRIPT_LIST_TESTID)).not.toContainText(ERROR_TEXT_PATTERN);
  });

  test('a third regenerate extends the same group rather than starting a new one', async ({
    page,
  }) => {
    const mock = await openChat(page);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await regenerateLast(page, mock, SECOND_ANSWER);
    await regenerateLast(page, mock, THIRD_ANSWER);

    await expect(pagerOn(assistantBubbles(page).last())).toContainText(PAGER_THIRD_OF_THREE);
    await expect(assistantBubbles(page)).toHaveCount(1);
  });

  test('editing a message branches it and each version keeps its own reply', async ({ page }) => {
    const mock = await openChat(page);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await runTurn(page, mock, FOLLOW_UP_PROMPT, FOLLOW_UP_ANSWER);

    const followUpBubble = page.locator(USER_BUBBLE).last();
    await followUpBubble.hover();
    await followUpBubble.getByRole('button', { name: EDIT_BUTTON_LABEL }).click();

    const editor = page.getByPlaceholder(EDIT_PLACEHOLDER);
    await expect(editor).toBeEditable({ timeout: LOAD_TIMEOUT_MS });
    await editor.fill(EDITED_PROMPT);

    // Nothing is destroyed by a branching edit, so no confirmation stands
    // between the reader and the resend.
    const before = await mock.requestCount();
    await page.getByRole('button', { name: EDIT_SAVE_LABEL }).click();
    await mock.waitForRequest(before);
    await mock.push(EDITED_ANSWER);
    await settleStream(page, mock);

    const afterEdit = await readTranscript(page);
    expect(afterEdit.join('\n')).toContain(EDITED_PROMPT);
    expect(afterEdit.join('\n')).toContain(EDITED_ANSWER);
    expect(
      afterEdit.join('\n'),
      'the reply to the message that was edited stayed on the visible path',
    ).not.toContain(FOLLOW_UP_ANSWER);

    // The original question and the reply it produced come back together.
    const userPager = pagerOn(page.locator(USER_BUBBLE).last());
    await expect(userPager).toContainText(PAGER_SECOND_OF_TWO);
    await userPager.getByRole('button', { name: PREVIOUS_VARIANT_LABEL }).click();

    const afterSwitch = (await readTranscript(page)).join('\n');
    expect(afterSwitch).toContain(FOLLOW_UP_PROMPT);
    expect(afterSwitch).toContain(FOLLOW_UP_ANSWER);
    expect(afterSwitch).not.toContain(EDITED_ANSWER);
  });

  /**
   * The opening turn is the only message whose sibling group is the root one,
   * and the only branch a client has to ask for with `parentId: null` rather
   * than a uuid. It is also the case that survives a reload only if the server
   * converted the conversation instead of appending the revision to the end.
   */
  test('editing the opening message branches at the root and survives a reload', async ({
    page,
  }) => {
    const mock = await openChat(page);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await runTurn(page, mock, FOLLOW_UP_PROMPT, FOLLOW_UP_ANSWER);

    const openingBubble = page.locator(USER_BUBBLE).first();
    await openingBubble.hover();
    await openingBubble.getByRole('button', { name: EDIT_BUTTON_LABEL }).click();

    const editor = page.getByPlaceholder(EDIT_PLACEHOLDER);
    await expect(editor).toBeEditable({ timeout: LOAD_TIMEOUT_MS });
    await editor.fill(EDITED_PROMPT);

    const before = await mock.requestCount();
    await page.getByRole('button', { name: EDIT_SAVE_LABEL }).click();
    await mock.waitForRequest(before);
    await mock.push(EDITED_ANSWER);
    await settleStream(page, mock);

    // The revision replaced the whole conversation, not just the first turn:
    // everything under the original opening is on the other branch now.
    const branched = (await readTranscript(page)).join('\n');
    expect(branched).toContain(EDITED_PROMPT);
    expect(branched).toContain(EDITED_ANSWER);
    expect(branched, 'the original branch stayed on the visible path').not.toContain(FIRST_ANSWER);
    expect(branched).not.toContain(FOLLOW_UP_ANSWER);
    await expect(pagerOn(page.locator(USER_BUBBLE).first())).toContainText(PAGER_SECOND_OF_TWO);

    // A revision the server appended instead of branching would come back as a
    // fifth turn at the bottom, with no pager on the opening message.
    const conversationUrl = page.url();
    await page.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
    await expect(page.locator(USER_BUBBLE).first()).toContainText(EDITED_PROMPT, {
      timeout: LOAD_TIMEOUT_MS,
    });

    const reloaded = (await readTranscript(page)).join('\n');
    expect(reloaded).toContain(EDITED_ANSWER);
    expect(reloaded, 'the abandoned branch came back as visible turns').not.toContain(FIRST_ANSWER);
    await expect(pagerOn(page.locator(USER_BUBBLE).first())).toContainText(PAGER_SECOND_OF_TWO);

    // And the original opening turn, with its whole tail, is still reachable.
    await pagerOn(page.locator(USER_BUBBLE).first())
      .getByRole('button', { name: PREVIOUS_VARIANT_LABEL })
      .click();
    const original = (await readTranscript(page)).join('\n');
    expect(original).toContain(FIRST_ANSWER);
    expect(original).toContain(FOLLOW_UP_ANSWER);
    expect(original).not.toContain(EDITED_ANSWER);
  });

  test('the selected variant survives a reload', async ({ page }) => {
    const mock = await openChat(page);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await regenerateLast(page, mock, SECOND_ANSWER);

    await pagerOn(assistantBubbles(page).last())
      .getByRole('button', { name: PREVIOUS_VARIANT_LABEL })
      .click();
    await expect(lastAssistantProse(page)).toContainText(FIRST_ANSWER);

    const conversationUrl = page.url();
    await page.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);

    await expect(lastAssistantProse(page)).toContainText(FIRST_ANSWER, {
      timeout: LOAD_TIMEOUT_MS,
    });
    const reloaded = (await readTranscript(page)).join('\n');
    expect(reloaded, 'the abandoned variant came back as a visible turn').not.toContain(
      SECOND_ANSWER,
    );
    await expect(pagerOn(assistantBubbles(page).last())).toContainText(PAGER_FIRST_OF_TWO);
  });

  /**
   * The height cache is keyed by index with no partial invalidation, so a switch
   * that leaves stale measurements behind places every row below the branch
   * point wrong. Enough turns to exceed the overscan is what makes that visible.
   */
  test('switching in a long transcript anchors on the branch point and settles', async ({
    page,
  }) => {
    const mock = await openChat(page);
    for (let turn = ZERO; turn < PADDING_TURN_COUNT; turn += 1) {
      await runTurn(page, mock, paddingPrompt(turn), paddingAnswer(turn));
    }
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await regenerateLast(page, mock, SECOND_ANSWER);

    await pagerOn(assistantBubbles(page).last())
      .getByRole('button', { name: PREVIOUS_VARIANT_LABEL })
      .click();
    await page.waitForTimeout(SCROLL_SETTLE_MS);

    // The switched answer is on screen rather than scrolled past, and the
    // transcript is not still moving a beat later.
    await expect(lastAssistantProse(page)).toBeInViewport();
    const settled = await readScrollTop(page);
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    expect(
      Math.abs((await readScrollTop(page)) - settled),
      'the transcript was still re-anchoring after the switch',
    ).toBeLessThanOrEqual(SCROLL_DRIFT_ALLOWANCE_PX);
    await expect(page.getByTestId(TRANSCRIPT_LIST_TESTID)).not.toContainText(ERROR_TEXT_PATTERN);
  });

  /** Edge decision 1: stop the stream first, then page. */
  test('paging is unavailable while an answer is streaming', async ({ page }) => {
    const mock = await openChat(page);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await regenerateLast(page, mock, SECOND_ANSWER);

    const before = await mock.requestCount();
    await sendPrompt(page, FOLLOW_UP_PROMPT);
    await mock.waitForRequest(before);
    await mock.push('Streaming, so the pager must not move.');

    const pager = pagerOn(assistantBubbles(page).first());
    await expect(pager.getByRole('button', { name: PREVIOUS_VARIANT_LABEL })).toBeDisabled();

    await settleStream(page, mock);
    await expect(pager.getByRole('button', { name: PREVIOUS_VARIANT_LABEL })).toBeEnabled();
  });

  test('a conversation nobody regenerated shows no pager at all', async ({ page }) => {
    const mock = await openChat(page);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await runTurn(page, mock, FOLLOW_UP_PROMPT, FOLLOW_UP_ANSWER);

    await expect(page.getByTestId(VARIANT_PAGER_TESTID)).toHaveCount(ZERO);
    const transcript = (await readTranscript(page)).join('\n');
    expect(transcript).toContain(FIRST_ANSWER);
    expect(transcript).toContain(FOLLOW_UP_ANSWER);
  });

  /**
   * With the gate off, Regenerate is still the destructive replace it was, the
   * flag has to be able to take the whole feature back out.
   */
  test('regenerate replaces in place when the gate is off', async ({ page }) => {
    const mock = await openChat(page, MESSAGE_VARIANTS_OFF);
    await runTurn(page, mock, FIRST_PROMPT, FIRST_ANSWER);
    await regenerateLast(page, mock, SECOND_ANSWER);

    await expect(page.getByTestId(VARIANT_PAGER_TESTID)).toHaveCount(ZERO);
    const transcript = (await readTranscript(page)).join('\n');
    expect(transcript).toContain(SECOND_ANSWER);
    expect(transcript).not.toContain(FIRST_ANSWER);
  });
});
