import { expect, test, type Page } from '@playwright/test';
import { getModels } from '@agiworkforce/types';
import { CLERK_SESSION_COOKIE } from '@agiworkforce/identity/browser';

import { signIn } from './qa-capability-harness';

const QA_MODEL_ID = process.env['QA_MODEL'];
const LIVE_MODEL = getModels().find((model) => model.id === QA_MODEL_ID);
const CHAT_MEASURE_PREFIX = 'agi.chat.';

async function selectComposerModel(page: Page, modelName: string): Promise<void> {
  await page.getByRole('button', { name: /change model|saving model selection/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Models' });
  const target = dialog.getByRole('option', { name: modelName, exact: true });
  if (!(await target.isVisible({ timeout: 1500 }).catch(() => false))) {
    const allModels = dialog.getByRole('button', { name: /All models/ });
    if (await allModels.count()) await allModels.first().click();
    await dialog.getByRole('textbox', { name: 'Search models' }).fill(modelName);
  }
  await expect(target).toBeVisible({ timeout: 10_000 });
  await target.click();
}

test.describe('live managed-chat latency', () => {
  test('records the successful T0 to T10 baseline for an explicitly selected zero-cost model', async ({
    page,
  }, testInfo) => {
    // llm-guardrail-allow: This live provider test runs only with explicit opt-in and a zero-cost catalog model.
    test.skip(
      process.env['RUN_LIVE_CHAT_E2E'] !== '1',
      'Set RUN_LIVE_CHAT_E2E=1 and QA_MODEL to authorize a live zero-cost provider request.',
    );
    expect(testInfo.retry, 'Live provider tests must not retry').toBe(0);
    expect(testInfo.repeatEachIndex, 'Live provider tests must not repeat').toBe(0);
    expect(LIVE_MODEL, `QA_MODEL=${QA_MODEL_ID} is not a catalog model`).toBeTruthy();
    expect(LIVE_MODEL?.inputCost).toBe(0);
    expect(LIVE_MODEL?.outputCost).toBe(0);
    expect(LIVE_MODEL?.capabilities.streaming).toBe(true);
    test.setTimeout(180_000);

    await signIn(page);
    const clientSessionPresent = await page.evaluate(() =>
      Boolean((window as unknown as { Clerk?: { session?: { id?: string } } }).Clerk?.session?.id),
    );
    expect(clientSessionPresent, 'Clerk ticket sign-in must establish a client session').toBe(true);
    const browserCookieNames = (await page.context().cookies(page.url())).map(
      (cookie) => cookie.name,
    );
    expect(browserCookieNames, 'The QA browser must carry a session cookie').toContain(
      CLERK_SESSION_COOKIE,
    );
    const serverSessionStatus = await page.evaluate(
      async () => (await fetch('/api/me', { credentials: 'same-origin' })).status,
    );
    expect(serverSessionStatus, 'The server must recognize the QA browser session').toBe(200);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    const composer = page.getByRole('textbox', { name: /message input/i });
    await expect(composer).toBeEditable({ timeout: 20_000 });
    await selectComposerModel(page, LIVE_MODEL!.name);

    const prompt = `Latency acceptance ${Date.now()}. Reply with exactly: Ready.`;
    await composer.fill(prompt);
    const completionPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/llm/v1/chat/completions' &&
        response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    const completion = await completionPromise;

    const completionBody = (
      completion.status() === 200 ? null : await completion.json().catch(() => null)
    ) as { error?: { code?: string; type?: string } } | null;
    expect(
      completion.status(),
      `Chat request failed: code=${completionBody?.error?.code ?? 'unknown'}, type=${completionBody?.error?.type ?? 'unknown'}`,
    ).toBe(200);
    expect(completion.headers()['x-accel-buffering']).toBe('no');
    const traceparent = completion.request().headers()['traceparent'];
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/u);
    const traceId = traceparent!.split('-')[1]!;

    await page.waitForFunction(
      ({ prefix, id }) =>
        performance.getEntriesByName(`${prefix}${id}.submit-to-done`, 'measure').length === 1 &&
        performance.getEntriesByName(`${prefix}${id}.submit-to-first-paint`, 'measure').length ===
          1,
      { prefix: CHAT_MEASURE_PREFIX, id: traceId },
      { timeout: 30_000 },
    );
    const latency = await page.evaluate(
      ({ prefix, id }) => {
        const tracePrefix = `${prefix}${id}.`;
        const measures = Object.fromEntries(
          performance
            .getEntriesByType('measure')
            .filter((entry) => entry.name.startsWith(tracePrefix))
            .map((entry) => [entry.name.slice(tracePrefix.length), Math.round(entry.duration)]),
        );
        const marks = Object.fromEntries(
          performance
            .getEntriesByType('mark')
            .filter((entry) => entry.name.startsWith(tracePrefix))
            .map((entry) => [entry.name.slice(tracePrefix.length), Math.round(entry.startTime)]),
        );
        return { traceId: id, marks, measures };
      },
      { prefix: CHAT_MEASURE_PREFIX, id: traceId },
    );

    expect(latency.measures['fetch-to-first-chunk']).toBeGreaterThan(0);
    expect(latency.measures['submit-to-first-paint']).toBeGreaterThan(0);
    expect(latency.measures['submit-to-done']).toBeGreaterThan(0);
    console.log(`[live-chat-latency] ${JSON.stringify(latency)}`);
  });
});
