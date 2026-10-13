import { expect, test, type Page } from '@playwright/test';

import { NOTIFY_CTA, NOTIFY_FORM_ID } from '../lib/surface-status';
import { mockAuthProvider } from './lib/mock-auth-provider';

const NOTIFY_PAGES = ['/mobile', '/chrome-extension'] as const;
const EMAIL_LABEL = 'Email address';
const LOADING_LABEL = 'Loading download options';
const COOKIE_REGION_NAME = 'Cookie consent';
const COOKIE_DISMISS_LABEL = 'Close and reject non-essential cookies';
const SLOW_LINK_KBPS = 400;
const SLOW_LINK_LATENCY_MS = 150;
const BITS_PER_KILOBYTE = 8;

declare global {
  interface Window {
    __agiSawDownloadLoading?: boolean;
  }
}

// The landing only fails when /download shows its loading state before the page,
// and a fast local server can skip that state. A slow link forces the order.
async function slowTheLink(page: Page) {
  const bytesPerSecond = (SLOW_LINK_KBPS * 1000) / BITS_PER_KILOBYTE;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: SLOW_LINK_LATENCY_MS,
    downloadThroughput: bytesPerSecond,
    uploadThroughput: bytesPerSecond,
  });
}

async function watchForLoadingState(page: Page) {
  await page.evaluate((label) => {
    const showing = () => document.querySelector(`[role="status"][aria-label="${label}"]`) !== null;
    window.__agiSawDownloadLoading = showing();
    new MutationObserver(() => {
      if (showing()) window.__agiSawDownloadLoading = true;
    }).observe(document.documentElement, { childList: true, subtree: true });
  }, LOADING_LABEL);
}

test.describe('Get notified lands on the form that takes the address', () => {
  for (const route of NOTIFY_PAGES) {
    test(`${route}: the first Get notified ends at the notify form with the email field in view`, async ({
      page,
    }) => {
      await mockAuthProvider(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      const cookieBanner = page.getByRole('region', { name: COOKIE_REGION_NAME });
      await cookieBanner.getByLabel(COOKIE_DISMISS_LABEL).click();
      await expect(cookieBanner).toBeHidden();

      const notify = page
        .getByRole('main')
        .getByRole('link', { name: NOTIFY_CTA.label, exact: true })
        .first();
      await expect(notify).toHaveAttribute('href', NOTIFY_CTA.href);

      await slowTheLink(page);
      await watchForLoadingState(page);
      await notify.click();

      await page.waitForURL((url) => `${url.pathname}${url.hash}` === NOTIFY_CTA.href);
      const email = page.locator(`#${NOTIFY_FORM_ID}`).getByRole('textbox', { name: EMAIL_LABEL });
      await expect(email).toBeInViewport();

      expect(
        await page.evaluate(() => window.__agiSawDownloadLoading),
        'the page must arrive by a client-side navigation that showed the loading state first, or this proves nothing',
      ).toBe(true);

      await page.waitForLoadState('networkidle');
      await expect(email).toBeInViewport();
    });
  }
});
