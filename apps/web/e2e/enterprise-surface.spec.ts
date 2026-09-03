import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Sweeps the surface an enterprise buyer actually walks before signing.
 *
 * Runs against whatever `ENTERPRISE_SWEEP_BASE_URL` points at, defaulting to
 * production, because the question this answers is "what does a customer see",
 * not "what does the branch build". Everything here is a public GET; no
 * credential is used and nothing is written.
 */
const BASE = process.env['ENTERPRISE_SWEEP_BASE_URL'] ?? 'https://agiworkforce.com';

/** The buyer's path: what it is, what it costs, and whether it survives review. */
const ENTERPRISE_ROUTES = [
  '/enterprise',
  '/business',
  '/teams',
  '/pricing',
  '/trust',
  '/security',
  '/byok',
  '/local',
  '/dpa',
  '/sla',
  '/subprocessors',
  '/data-use',
  '/acceptable-use',
  '/privacy',
  '/terms',
  '/model-licenses',
  '/accessibility',
  '/refund-policy',
  '/contact-sales',
  '/customers',
  '/solutions',
  '/download',
] as const;

interface PageFailures {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

function watch(page: Page): PageFailures {
  const f: PageFailures = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') f.consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => f.pageErrors.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => {
    const url = r.url();
    // Analytics and telemetry beacons fail on a blocked network and say nothing
    // about the page a buyer is reading.
    if (/google-analytics|googletagmanager|clerk-telemetry|vitals\.vercel/.test(url)) return;
    f.failedRequests.push(`${r.failure()?.errorText ?? 'failed'} ${url.slice(0, 140)}`);
  });
  return f;
}

/**
 * Waits until the theme's custom properties have actually painted.
 *
 * Axe compares computed colours. Run it before the token stylesheet applies and
 * `body` is still transparent, so every element is measured against the browser
 * default and a clean page reports about fifty colour-contrast violations that
 * vanish on the next run. That flakiness is worse than no check: it trains you
 * to ignore the result.
 */
async function settleTheme(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const bg = getComputedStyle(document.body).backgroundColor;
      return bg !== '' && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
    },
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
}

test.describe('enterprise buyer surface', () => {
  for (const route of ENTERPRISE_ROUTES) {
    test(`${route} renders clean`, async ({ page }) => {
      const failures = watch(page);
      const response = await page.goto(`${BASE}${route}`, { waitUntil: 'load' });

      expect(response, `${route} produced no response`).not.toBeNull();
      expect(response!.status(), `${route} HTTP status`).toBeLessThan(400);

      await page.locator('h1, h2, main').first().waitFor({ state: 'attached', timeout: 20_000 });
      await expect
        .poll(
          async () =>
            (
              (await page
                .locator('body')
                .innerText()
                .catch(() => '')) || ''
            ).length,
          {
            timeout: 20_000,
          },
        )
        .toBeGreaterThan(200);

      // A page that renders its error boundary is a 200 that failed.
      const body =
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) || '';
      expect(body).not.toMatch(/Application error: a client-side exception/i);
      expect(body).not.toMatch(/This page could not be found/i);

      expect(failures.pageErrors, `${route} threw`).toEqual([]);
      expect(failures.failedRequests, `${route} had failed requests`).toEqual([]);
      expect(failures.consoleErrors, `${route} logged console errors`).toEqual([]);
    });
  }
});

test.describe('enterprise surface accessibility', () => {
  for (const route of ['/enterprise', '/pricing', '/trust', '/security', '/contact-sales']) {
    test(`${route} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
      await settleTheme(page);

      // @axe-core/playwright bundles its own Playwright types, which do not
      // structurally match this repo's. The other specs cast the same way.
      const results = await new AxeBuilder({ page: page as never })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        blocking.map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes), ${v.help}`),
        `${route} accessibility`,
      ).toEqual([]);
    });
  }
});

test.describe('compliance claims stay consistent across pages', () => {
  test('no page claims a certification we do not hold', async ({ page }) => {
    const offenders: string[] = [];
    for (const route of ['/enterprise', '/trust', '/security', '/pricing']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      const text =
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) || '';

      const claims = (subject: RegExp, verbs: string): boolean => {
        const window = new RegExp(`${subject.source}[^.]{0,80}`, 'gi');
        for (const match of text.match(window) ?? []) {
          if (!new RegExp(`\\b(${verbs})\\b`, 'i').test(match)) continue;
          if (/\b(no|not|never|without|neither|nor|lacks?|absent|pending|planned)\b/i.test(match))
            continue;
          return true;
        }
        return false;
      };
      const soc2Claimed = claims(/\bSOC\s?2\b/, 'certified|compliant|attested');
      const isoClaimed = claims(/\bISO\s?27001\b/, 'certified|compliant');
      const hipaaClaimed = claims(/\bHIPAA\b/, 'compliant|certified|ready');
      if (soc2Claimed) offenders.push(`${route}: claims SOC 2`);
      if (isoClaimed) offenders.push(`${route}: claims ISO 27001`);
      if (hipaaClaimed) offenders.push(`${route}: claims HIPAA`);
    }
    expect(offenders, 'pages claiming certifications the ledger says are not held').toEqual([]);
  });
});
