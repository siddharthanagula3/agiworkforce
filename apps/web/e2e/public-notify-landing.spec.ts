import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';

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
const DOWNLOAD_REQUEST_PATHS = [
  '/api/releases/desktop-cloud/latest',
  '/api/releases/cli/latest',
  '/api/download/checksums',
] as const;
const DOWNLOAD_SETTLE_TIMEOUT_MS = 30_000;

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

function observeDownloadRequests(page: Page) {
  const origin = new URL(page.url()).origin;
  const requests = new Map<
    Request,
    { path: string; state: 'pending' | 'finished' | 'failed'; response?: Response }
  >();
  const observe = (request: Request) => {
    const url = new URL(request.url());
    if (
      url.origin === origin &&
      request.method() === 'GET' &&
      DOWNLOAD_REQUEST_PATHS.some((path) => path === url.pathname)
    ) {
      requests.set(request, { path: url.pathname, state: 'pending' });
    }
  };
  const finish = (request: Request) => {
    const observation = requests.get(request);
    if (observation) observation.state = 'finished';
  };
  const respond = (response: Response) => {
    const observation = requests.get(response.request());
    if (observation) observation.response = response;
  };
  const fail = (request: Request) => {
    const observation = requests.get(request);
    if (observation) observation.state = 'failed';
  };
  page.on('request', observe);
  page.on('response', respond);
  page.on('requestfinished', finish);
  page.on('requestfailed', fail);

  return {
    async settle() {
      await expect
        .poll(
          () =>
            DOWNLOAD_REQUEST_PATHS.flatMap((path) => {
              const matching = [...requests.values()].filter((request) => request.path === path);
              return matching.length === 0
                ? [`${path}: no request observed on ${origin}`]
                : matching
                    .filter(
                      (request) =>
                        request.state === 'pending' && (!request.response || request.response.ok()),
                    )
                    .map(() => `${path}: pending`);
            }),
          {
            timeout: DOWNLOAD_SETTLE_TIMEOUT_MS,
            message:
              'Every download request must finish its consumed payload or reach an error response',
          },
        )
        .toEqual([]);

      for (const observation of requests.values()) {
        const response = observation.response;
        if (observation.path === '/api/download/checksums') {
          expect(observation.state, 'A failed checksum request has no settled error UI').not.toBe(
            'failed',
          );
          if (!response?.ok()) {
            await expect(page.getByRole('list', { name: 'Installer checksums' })).toHaveCount(0);
          }
        } else if (response?.status() === 404) {
          const unavailable =
            observation.path === '/api/releases/desktop-cloud/latest'
              ? 'AGI Desktop downloads unavailable'
              : 'CLI downloads unavailable';
          await expect(page.getByRole('status', { name: unavailable, exact: true })).toBeVisible();
        } else if (observation.state === 'failed' || !response?.ok()) {
          const error =
            observation.path === '/api/releases/desktop-cloud/latest'
              ? page.locator('#desktop-downloads').getByRole('alert')
              : page.getByRole('status', { name: 'CLI download check failed' });
          await expect(error).toBeVisible();
        }
      }
      await expect(page.locator('#desktop-downloads')).toBeVisible();
      await expect(page.locator('#cli-downloads')).toBeVisible();
      await expect(
        page.locator('#desktop-downloads [aria-busy="true"], #cli-downloads [aria-busy="true"]'),
      ).toHaveCount(0);
    },
    dispose() {
      page.off('request', observe);
      page.off('response', respond);
      page.off('requestfinished', finish);
      page.off('requestfailed', fail);
    },
  };
}

async function expectStableEmailGeometry(email: Locator) {
  let previous = '';
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const sample = await email.evaluate((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height, fonts: document.fonts.status };
        });
        const signature = JSON.stringify(sample);
        stableSamples =
          sample.fonts === 'loaded' &&
          sample.width > 0 &&
          sample.height > 0 &&
          signature === previous
            ? stableSamples + 1
            : 0;
        previous = signature;
        return stableSamples;
      },
      { message: 'The email field must retain its geometry after download content settles' },
    )
    .toBeGreaterThanOrEqual(3);
}

test.describe('Get notified lands on the form that takes the address', () => {
  for (const route of NOTIFY_PAGES) {
    test(`${route}: the first Get notified ends at the notify form with the email field in view`, async ({
      page,
    }) => {
      await test.step('Open the public page and dismiss cookie consent', async () => {
        await mockAuthProvider(page);
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        const cookieBanner = page.getByRole('region', { name: COOKIE_REGION_NAME });
        await cookieBanner.getByLabel(COOKIE_DISMISS_LABEL).click();
        await expect(cookieBanner).toBeHidden();
      });

      const email = page.locator(`#${NOTIFY_FORM_ID}`).getByRole('textbox', { name: EMAIL_LABEL });
      const downloads = observeDownloadRequests(page);
      try {
        await test.step('Follow Get notified over a slow link and witness client loading', async () => {
          const notify = page
            .getByRole('main')
            .getByRole('link', { name: NOTIFY_CTA.label, exact: true })
            .first();
          await expect(notify).toHaveAttribute('href', NOTIFY_CTA.href);
          await slowTheLink(page);
          await watchForLoadingState(page);
          await notify.click();
          await page.waitForURL((url) => `${url.pathname}${url.hash}` === NOTIFY_CTA.href);
          await expect(email).toBeInViewport();
          expect(
            await page.evaluate(() => window.__agiSawDownloadLoading),
            'the page must arrive by a client-side navigation that showed the loading state first, or this proves nothing',
          ).toBe(true);
        });
        await test.step('Wait for all download requests and release loading states to settle', async () => {
          await downloads.settle();
        });
        await test.step('Keep the email field in view after its geometry settles', async () => {
          await expectStableEmailGeometry(email);
          await expect(email).toBeInViewport();
        });
      } finally {
        downloads.dispose();
      }
    });
  }
});
