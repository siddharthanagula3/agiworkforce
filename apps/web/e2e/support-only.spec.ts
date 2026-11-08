import { expect, test } from '@playwright/test';
import { OUT_OF_SCOPE_COPY } from '../lib/support/agent/policy/out-of-scope';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  NECESSARY_ONLY_PREFERENCES,
  buildCookieConsentRecord,
} from '../shared/lib/cookie-consent';

test.use({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  reducedMotion: 'reduce',
  storageState: { cookies: [], origins: [] },
});

test('refuses unrelated work through the real support endpoint without a model route', async ({
  page,
}, testInfo) => {
  const question = 'Write a Python script to fix my AGI account error';
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify(buildCookieConsentRecord(NECESSARY_ONLY_PREFERENCES)),
  ] as const);
  await page.goto('/help/delete-your-account', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open product support', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Product support', exact: true });
  await expect(panel).toContainText('Ask a product-support question.');
  await panel.getByRole('textbox', { name: 'Ask a support question' }).fill(question);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/support/ask' &&
      response.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: 'Ask', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const payload = response.request().postDataJSON() as Record<string, unknown>;
  expect(payload['message']).toBe(question);
  expect(payload['model']).toBeUndefined();
  expect(payload['tools']).toBeUndefined();
  expect(response.request().headers()['x-csrf-token']).toBeTruthy();
  expect(await response.json()).toMatchObject({
    kind: 'abstention',
    reason: 'out_of_scope',
    route: null,
    handoffOffered: false,
  });
  await expect(panel).toContainText(OUT_OF_SCOPE_COPY);
  await panel.screenshot({ path: testInfo.outputPath('support-only-refusal.png') });
});
