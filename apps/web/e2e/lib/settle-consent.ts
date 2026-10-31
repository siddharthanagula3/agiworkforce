import { expect, type Page } from '@playwright/test';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  parseCookieConsentRecord,
} from '../../shared/lib/cookie-consent';

export async function settleConsent(page: Page) {
  const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
  const hasCurrentDecision = async () =>
    isCookieConsentCurrent(
      parseCookieConsentRecord(
        await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
      ),
    );
  await expect
    .poll(async () => (await banner.isVisible()) || (await hasCurrentDecision()), {
      timeout: 15_000,
    })
    .toBe(true);
  if ((await banner.isVisible()) && !(await hasCurrentDecision()))
    await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
  await expect(banner).toBeHidden();
}
