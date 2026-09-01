import { expect, test, type Locator, type Page } from '@playwright/test';

import { installSseChatMock, type SseChatMock } from './lib/sse-chat-mock';
import { signIn } from './qa-capability-harness';

const CHAT_ROUTE = '/chat';
const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

const SPEC_TIMEOUT_MS = 10 * 60_000;
const LOAD_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 60_000;
const FRAME_SETTLE_MS = 140;
const DONE_SETTLE_MS = 1_200;
const SCROLL_SETTLE_MS = 900;
const CONSENT_WAIT_MS = 6_000;

const STREAM_CHUNK_CHARS = 32;
const SAMPLE_EVERY_CHUNKS = 2;
const MIN_OBSERVED_GROWTH_STEPS = 4;
const SCROLL_THRESHOLD_PX = 120;
const TRANSCRIPT_OVERSCAN_ROWS = 6;
const PRIOR_TURN_COUNT = TRANSCRIPT_OVERSCAN_ROWS + 3;
const EXPECTED_MATH_BLOCKS = 1;
const ZERO = 0;

const COMPOSER_LABEL = /message input/i;
const STOP_BUTTON_LABEL = /stop the current response/i;
const CONSENT_DISMISS_LABEL = 'Ask me later';
const SCROLL_TO_BOTTOM_LABEL = 'Scroll to bottom';
const STREAMING_ARTIFACT_CHIP_LABEL = 'Show artifact being written';
const THINKING_PLACEHOLDER = 'Thinking...';

const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const MESSAGE_TEXT = '.message-text';
const TRANSCRIPT_LIST = 'chat-message-list';
const TRANSCRIPT_SCROLLER = '[role="log"][aria-label="Chat messages"]';
const STREAMING_ARTIFACT_TESTID = 'streaming-artifact';
const STREAMING_ARTIFACT_CODE_TESTID = 'streaming-artifact-code';

const MERMAID_ATTRIBUTE = 'data-mermaid';
const MERMAID_PENDING = 'pending';
const MERMAID_RENDERING = 'rendering';
const MERMAID_READY = 'ready';
const MERMAID_FAILED = 'failed';
const MERMAID_SOURCE_SELECTOR = '.mermaid-source';
const MERMAID_FAILURE_PATTERN = 'could not be drawn';

const KATEX_DISPLAY_SELECTOR = '.katex-display';
const DISPLAY_MATH_DELIMITER = '$$';
const FENCE_MARKER = '```';
const ERROR_TEXT_PATTERN = /something went wrong|application error/i;

const MESSAGES_PATH_FRAGMENT = '/messages';
const ASSISTANT_ROLE_MARKER = '"role":"assistant"';

const PROSE_PARAGRAPH_COUNT = 6;
const PROSE_BODY =
  'The renderer must keep every word it has already committed exactly where it was placed, so a reader following along never sees the answer rewrite itself behind the cursor.';
const LONG_PROSE = Array.from(
  { length: PROSE_PARAGRAPH_COUNT },
  (_, index) => `Streamed paragraph ${index + 1}. ${PROSE_BODY}`,
).join('\n\n');

const MERMAID_LANGUAGE = 'mermaid';
const MERMAID_FIRST_LINE = 'graph TD';
const MERMAID_SOURCE = [
  MERMAID_FIRST_LINE,
  '  Arrive[Chunk arrives] --> Split[Split settled blocks]',
  '  Split --> Tail[Render the active tail]',
  '  Tail --> Settle[Settle when the fence closes]',
].join('\n');
const MERMAID_LEAD_SENTENCE = 'Here is the pipeline the renderer follows.';
const MERMAID_TRAIL_SENTENCE = 'The answer keeps going once the diagram has closed.';
const MERMAID_ANSWER = [
  MERMAID_LEAD_SENTENCE,
  '',
  `${FENCE_MARKER}${MERMAID_LANGUAGE}`,
  MERMAID_SOURCE,
  FENCE_MARKER,
  '',
  MERMAID_TRAIL_SENTENCE,
].join('\n');
const MERMAID_CLOSE_OFFSET = MERMAID_ANSWER.lastIndexOf(FENCE_MARKER) + FENCE_MARKER.length;

const DISPLAY_MATH_BODY = '\\int_{0}^{1} x^{2} \\, dx = \\frac{1}{3}';
const MATH_ANSWER = [
  'The definite integral settles to a single closed form.',
  '',
  DISPLAY_MATH_DELIMITER,
  DISPLAY_MATH_BODY,
  DISPLAY_MATH_DELIMITER,
  '',
  'The sentence after the block proves the math has settled.',
].join('\n');
const MATH_CLOSE_OFFSET =
  MATH_ANSWER.lastIndexOf(DISPLAY_MATH_DELIMITER) + DISPLAY_MATH_DELIMITER.length;

const ARTIFACT_LANGUAGE = 'html';
const ARTIFACT_TITLE = 'Streaming artifact probe';
const ARTIFACT_BODY_MARKER = 'Artifact body written while the answer streams';
const ARTIFACT_SOURCE = [
  '<!DOCTYPE html>',
  '<html>',
  `  <head><title>${ARTIFACT_TITLE}</title></head>`,
  `  <body><p>${ARTIFACT_BODY_MARKER}</p></body>`,
  '</html>',
].join('\n');
const ARTIFACT_LEAD_SENTENCE = 'The document below is written into the side panel.';
const ARTIFACT_TRAIL_SENTENCE = 'The transcript keeps only these two sentences.';
const ARTIFACT_ANSWER = [
  ARTIFACT_LEAD_SENTENCE,
  '',
  `${FENCE_MARKER}${ARTIFACT_LANGUAGE}`,
  ARTIFACT_SOURCE,
  FENCE_MARKER,
  '',
  ARTIFACT_TRAIL_SENTENCE,
].join('\n');
const ARTIFACT_CLOSE_OFFSET = ARTIFACT_ANSWER.lastIndexOf(FENCE_MARKER) + FENCE_MARKER.length;

const PARITY_MARKER = 'Static parity probe';
const PARITY_ANSWER = [
  `## ${PARITY_MARKER}`,
  '',
  'A paragraph with **bold**, _italic_ and `inline code` inside it.',
  '',
  '- First bullet of the settled list',
  '- Second bullet of the settled list',
  '',
  '| Column A | Column B |',
  '| --- | --- |',
  '| one | two |',
  '',
  `${FENCE_MARKER}python`,
  'def total(values):',
  '    return sum(values)',
  FENCE_MARKER,
  '',
  DISPLAY_MATH_DELIMITER,
  DISPLAY_MATH_BODY,
  DISPLAY_MATH_DELIMITER,
  '',
  'A closing paragraph that follows the settled math block.',
].join('\n');

const SHORT_ANSWER_LINES = 3;
const PROMPT_PREFIX = 'Streaming markdown probe';
const SCROLL_STREAM_MARKER = 'Anchor probe paragraph that must survive the round trip';
const SCROLL_STREAM_ANSWER = [SCROLL_STREAM_MARKER, '', LONG_PROSE].join('\n');

const VOLATILE_ATTRIBUTE_PATTERN =
  /\s(?:id|for|aria-describedby|aria-labelledby|data-message-id|style)="[^"]*"/g;
const BETWEEN_TAGS_PATTERN = />\s+</g;
const WHITESPACE_PATTERN = /\s+/g;

function priorAnswer(turnIndex: number): string {
  return Array.from(
    { length: SHORT_ANSWER_LINES },
    (_, line) => `Turn ${turnIndex + 1} line ${line + 1}. ${PROSE_BODY}`,
  ).join('\n\n');
}

function normalizeMessageHtml(html: string): string {
  return html
    .replace(VOLATILE_ATTRIBUTE_PATTERN, '')
    .replace(BETWEEN_TAGS_PATTERN, '><')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

function collapse(text: string): string {
  return text.replace(WHITESPACE_PATTERN, ' ').trim();
}

function assistantMessage(page: Page): Locator {
  return page.locator(ASSISTANT_BUBBLE).last();
}

function assistantProse(page: Page): Locator {
  return assistantMessage(page).locator(MESSAGE_TEXT);
}

async function dismissConsent(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: CONSENT_DISMISS_LABEL })
    .click({ timeout: CONSENT_WAIT_MS })
    .catch(() => undefined);
}

async function openChat(page: Page): Promise<SseChatMock> {
  const mock = await installSseChatMock(page);
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

async function streamAnswer(
  page: Page,
  mock: SseChatMock,
  answer: string,
  onSample?: (emitted: number) => Promise<void>,
): Promise<void> {
  let chunkIndex = 0;
  for (let at = 0; at < answer.length; at += STREAM_CHUNK_CHARS) {
    const emitted = Math.min(at + STREAM_CHUNK_CHARS, answer.length);
    await mock.push(answer.slice(at, emitted));
    await page.waitForTimeout(FRAME_SETTLE_MS);
    if (onSample && chunkIndex % SAMPLE_EVERY_CHUNKS === ZERO) await onSample(emitted);
    chunkIndex += 1;
  }
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
  await streamAnswer(page, mock, answer);
  await settleStream(page, mock);
}

async function readScrollState(
  page: Page,
): Promise<{ scrollTop: number; distanceFromBottom: number } | null> {
  return page.evaluate((selector: string) => {
    const scroller = document.querySelector(selector) as HTMLElement | null;
    if (!scroller) return null;
    return {
      scrollTop: Math.round(scroller.scrollTop),
      distanceFromBottom: Math.round(
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
      ),
    };
  }, TRANSCRIPT_SCROLLER);
}

async function scrollTranscriptToTop(page: Page): Promise<void> {
  await page.evaluate((selector: string) => {
    const scroller = document.querySelector(selector) as HTMLElement | null;
    if (scroller) scroller.scrollTop = 0;
  }, TRANSCRIPT_SCROLLER);
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

interface MermaidSnapshot {
  pending: number;
  rendering: number;
  ready: number;
  failed: number;
  sourceText: string;
  failureTextVisible: boolean;
}

async function readMermaidSnapshot(page: Page): Promise<MermaidSnapshot> {
  return page.evaluate(
    (input: {
      attribute: string;
      pending: string;
      rendering: string;
      ready: string;
      failed: string;
      sourceSelector: string;
      failurePattern: string;
    }) => {
      const figures = Array.from(document.querySelectorAll(`[${input.attribute}]`));
      const countOf = (state: string) =>
        figures.filter((figure) => figure.getAttribute(input.attribute) === state).length;
      return {
        pending: countOf(input.pending),
        rendering: countOf(input.rendering),
        ready: countOf(input.ready),
        failed: countOf(input.failed),
        sourceText: figures
          .map((figure) => figure.querySelector(input.sourceSelector)?.textContent ?? '')
          .join('\n'),
        failureTextVisible: new RegExp(input.failurePattern, 'i').test(document.body.innerText),
      };
    },
    {
      attribute: MERMAID_ATTRIBUTE,
      pending: MERMAID_PENDING,
      rendering: MERMAID_RENDERING,
      ready: MERMAID_READY,
      failed: MERMAID_FAILED,
      sourceSelector: MERMAID_SOURCE_SELECTOR,
      failurePattern: MERMAID_FAILURE_PATTERN,
    },
  );
}

test.describe('streaming markdown', () => {
  test.setTimeout(SPEC_TIMEOUT_MS);
  test.use({ reducedMotion: 'reduce', viewport: DESKTOP_VIEWPORT } as never);

  test('a long answer appends without rewriting prose that has already settled', async ({
    page,
  }) => {
    const mock = await openChat(page);
    await sendPrompt(page, `${PROMPT_PREFIX}: long prose`);
    await mock.waitForRequest();

    const prose = assistantProse(page);
    await expect(assistantMessage(page)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

    const samples: string[] = [];
    await streamAnswer(page, mock, LONG_PROSE, async () => {
      const rendered = collapse(await prose.innerText());
      if (rendered !== THINKING_PLACEHOLDER) samples.push(rendered);
    });
    await settleStream(page, mock);

    const rewrites = samples
      .map((text, index) => ({ text, index }))
      .filter(({ text, index }) => index > ZERO && !text.startsWith(samples[index - 1] ?? ''))
      .map(({ index }) => `sample ${index}`);
    expect(rewrites, `settled prose changed under later tokens at: ${rewrites.join(', ')}`).toEqual(
      [],
    );

    const growthSteps = samples.filter(
      (text, index) => index > ZERO && text.length > (samples[index - 1] ?? '').length,
    ).length;
    expect(
      growthSteps,
      `the answer never grew across samples, so nothing streamed: ${samples.length} samples`,
    ).toBeGreaterThanOrEqual(MIN_OBSERVED_GROWTH_STEPS);

    expect(collapse(await prose.innerText())).toContain(collapse(LONG_PROSE));
  });

  test('a mermaid fence never surfaces a broken diagram or a raw fence while it streams', async ({
    page,
  }) => {
    const mock = await openChat(page);
    await sendPrompt(page, `${PROMPT_PREFIX}: mermaid`);
    await mock.waitForRequest();
    await expect(assistantMessage(page)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

    const prose = assistantProse(page);
    const chip = page.getByRole('button', { name: STREAMING_ARTIFACT_CHIP_LABEL });
    const failures: string[] = [];
    const fenceLeaks: string[] = [];
    let announcedWhileWriting = false;

    await streamAnswer(page, mock, MERMAID_ANSWER, async (emitted) => {
      const snapshot = await readMermaidSnapshot(page);
      if (snapshot.failed > ZERO || snapshot.failureTextVisible) {
        failures.push(`after ${emitted} chars`);
      }
      if ((await prose.innerText()).includes(`${FENCE_MARKER}${MERMAID_LANGUAGE}`)) {
        fenceLeaks.push(`after ${emitted} chars`);
      }
      if (emitted < MERMAID_CLOSE_OFFSET && (await chip.count())) announcedWhileWriting = true;
    });
    await settleStream(page, mock);

    expect(
      failures,
      `an unfinished diagram was reported as undrawable at: ${failures.join(', ')}`,
    ).toEqual([]);
    expect(
      fenceLeaks,
      `the raw mermaid fence reached the chat body at: ${fenceLeaks.join(', ')}`,
    ).toEqual([]);
    expect(
      announcedWhileWriting,
      'the diagram never announced itself while it was being written',
    ).toBe(true);

    const settled = await readMermaidSnapshot(page);
    expect(settled.failed, 'the completed diagram settled into the failure state').toBe(ZERO);
    expect(settled.pending, 'the completed diagram was left pending').toBe(ZERO);

    const finalProse = await prose.innerText();
    expect(finalProse).toContain(MERMAID_LEAD_SENTENCE);
    expect(finalProse).toContain(MERMAID_TRAIL_SENTENCE);
    expect(finalProse).not.toContain(FENCE_MARKER);
  });

  test('display math renders when its block closes and leaves no raw delimiters behind', async ({
    page,
  }) => {
    const mock = await openChat(page);
    await sendPrompt(page, `${PROMPT_PREFIX}: display math`);
    await mock.waitForRequest();

    const prose = assistantProse(page);
    await expect(assistantMessage(page)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

    const settledLeaks: string[] = [];
    await streamAnswer(page, mock, MATH_ANSWER, async (emitted) => {
      if (emitted < MATH_CLOSE_OFFSET) return;
      const text = await prose.innerText();
      if (text.includes(DISPLAY_MATH_DELIMITER)) settledLeaks.push(`after ${emitted} chars`);
    });
    await settleStream(page, mock);

    expect(
      settledLeaks,
      `raw ${DISPLAY_MATH_DELIMITER} stayed on screen after the block closed at: ${settledLeaks.join(', ')}`,
    ).toEqual([]);

    await expect(
      prose.locator(KATEX_DISPLAY_SELECTOR),
      'the closed math block never rendered',
    ).toHaveCount(EXPECTED_MATH_BLOCKS);
    expect(await prose.innerText()).not.toContain(DISPLAY_MATH_DELIMITER);
  });

  test('an artifact fence streams into the side panel and never into the transcript', async ({
    page,
  }) => {
    const mock = await openChat(page);
    await sendPrompt(page, `${PROMPT_PREFIX}: artifact`);
    await mock.waitForRequest();

    const prose = assistantProse(page);
    const panelCode = page.getByTestId(STREAMING_ARTIFACT_CODE_TESTID);
    await expect(assistantMessage(page)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

    const transcriptLeaks: string[] = [];
    const panelLengths: number[] = [];
    await streamAnswer(page, mock, ARTIFACT_ANSWER, async (emitted) => {
      const text = await prose.innerText();
      if (
        text.includes(`${FENCE_MARKER}${ARTIFACT_LANGUAGE}`) ||
        text.includes(ARTIFACT_BODY_MARKER)
      ) {
        transcriptLeaks.push(`after ${emitted} chars`);
      }
      if (emitted >= ARTIFACT_CLOSE_OFFSET) return;
      if (await panelCode.count()) panelLengths.push((await panelCode.innerText()).length);
    });

    expect(
      transcriptLeaks,
      `the raw artifact fence reached the chat body at: ${transcriptLeaks.join(', ')}`,
    ).toEqual([]);
    expect(
      panelLengths.length,
      'the side panel never received the artifact while it was being written',
    ).toBeGreaterThan(ZERO);
    expect(
      panelLengths[panelLengths.length - 1] ?? ZERO,
      `the side panel content never grew: ${panelLengths.join(', ')}`,
    ).toBeGreaterThan(panelLengths[0] ?? ZERO);

    await settleStream(page, mock);

    await expect(page.getByTestId(STREAMING_ARTIFACT_TESTID)).toHaveCount(ZERO);
    await expect(page.getByRole('button', { name: STREAMING_ARTIFACT_CHIP_LABEL })).toHaveCount(
      ZERO,
    );
    const finalProse = await prose.innerText();
    expect(finalProse).toContain(ARTIFACT_LEAD_SENTENCE);
    expect(finalProse).toContain(ARTIFACT_TRAIL_SENTENCE);
    expect(finalProse).not.toContain(ARTIFACT_BODY_MARKER);
    expect(finalProse).not.toContain(FENCE_MARKER);
  });

  test('returning through the scroll-to-bottom control re-anchors once and keeps the answer', async ({
    page,
  }) => {
    const mock = await openChat(page);
    for (let turn = ZERO; turn < PRIOR_TURN_COUNT; turn += 1) {
      await runTurn(page, mock, `${PROMPT_PREFIX}: turn ${turn + 1}`, priorAnswer(turn));
    }

    const before = await mock.requestCount();
    await sendPrompt(page, `${PROMPT_PREFIX}: anchored stream`);
    await mock.waitForRequest(before);

    const halfway = Math.floor(SCROLL_STREAM_ANSWER.length / 2);
    await streamAnswer(page, mock, SCROLL_STREAM_ANSWER.slice(ZERO, halfway));

    const marker = page.getByText(SCROLL_STREAM_MARKER, { exact: false });
    await expect(marker.first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    const streamedBefore = collapse(await assistantProse(page).innerText());

    await scrollTranscriptToTop(page);
    const fab = page.getByRole('button', { name: SCROLL_TO_BOTTOM_LABEL });
    await expect(fab, 'scrolling up did not offer a way back to the live answer').toBeVisible();
    await expect(
      marker,
      'the streaming answer was still mounted, so the scroll never cleared the overscan',
    ).toHaveCount(ZERO);

    const anchoredTop = await readScrollState(page);
    expect(anchoredTop).not.toBeNull();

    await streamAnswer(page, mock, SCROLL_STREAM_ANSWER.slice(halfway));
    const heldTop = await readScrollState(page);
    expect(
      heldTop?.scrollTop,
      'the transcript re-anchored itself while the reader was scrolled up',
    ).toBe(anchoredTop?.scrollTop);

    await settleStream(page, mock);
    await expect(page.getByTestId(TRANSCRIPT_LIST)).not.toContainText(ERROR_TEXT_PATTERN);

    await fab.click();
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    const landed = await readScrollState(page);
    expect(landed).not.toBeNull();
    expect(
      landed!.distanceFromBottom,
      `the control left the reader ${landed!.distanceFromBottom}px from the bottom`,
    ).toBeLessThanOrEqual(SCROLL_THRESHOLD_PX);
    await expect(fab).toHaveCount(ZERO);

    await page.waitForTimeout(SCROLL_SETTLE_MS);
    const resettled = await readScrollState(page);
    expect(resettled?.scrollTop, 'the transcript re-anchored a second time').toBe(
      landed!.scrollTop,
    );

    const streamedAfter = collapse(await assistantProse(page).innerText());
    expect(
      streamedAfter.startsWith(streamedBefore),
      'the answer changed across the round trip',
    ).toBe(true);
    expect(streamedAfter).toContain(collapse(SCROLL_STREAM_ANSWER));
    await expect(page.getByTestId(TRANSCRIPT_LIST)).not.toContainText(ERROR_TEXT_PATTERN);
  });

  test('the streamed DOM matches the same markdown rendered on reload', async ({ page }) => {
    const mock = await openChat(page);
    await sendPrompt(page, `${PROMPT_PREFIX}: static parity`);
    await mock.waitForRequest();
    await expect(assistantMessage(page)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

    await streamAnswer(page, mock, PARITY_ANSWER);

    const persisted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(MESSAGES_PATH_FRAGMENT) &&
        (response.request().postData() ?? '').includes(ASSISTANT_ROLE_MARKER),
      { timeout: STREAM_TIMEOUT_MS },
    );
    await settleStream(page, mock);
    await persisted;

    const conversationUrl = page.url();
    const streamedHtml = normalizeMessageHtml(await assistantProse(page).innerHTML());
    expect(streamedHtml, 'the streamed message rendered nothing to compare').toContain(
      PARITY_MARKER,
    );

    await page.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
    await expect(assistantProse(page)).toContainText(PARITY_MARKER, { timeout: LOAD_TIMEOUT_MS });
    await page.waitForTimeout(DONE_SETTLE_MS);

    const reloadedHtml = normalizeMessageHtml(await assistantProse(page).innerHTML());
    expect(reloadedHtml, 'the streamed DOM and the reloaded DOM disagree').toBe(streamedHtml);
  });
});
