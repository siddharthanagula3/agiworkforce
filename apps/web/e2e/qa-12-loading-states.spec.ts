import { expect, test } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * Loading states, reached by holding the list request open.
 *
 * A live sweep only measures the states the account's data produces, so a
 * loading state is invisible to it - the request has already returned by the
 * time anything is measured. Library shipped a bare spinner with no live
 * region while projects and schedules both announced their wait, which is the
 * kind of asymmetry only a deliberate slow response reveals.
 */

const SURFACES = [
  { route: '/chat/projects', api: '**/api/projects*' },
  { route: '/chat/library', api: '**/api/library**' },
  { route: '/tasks', api: '**/api/cloud-agent/runs*' },
  { route: '/chat/schedules', api: '**/api/schedules*' },
];

test('loading states hold a slow request without going blank or silent', async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page);
  const findings: unknown[] = [];

  for (const s of SURFACES) {
    // Hold the response open so the loading state is observable.
    await page.route(s.api, async (r) => {
      await new Promise((res) => setTimeout(res, 6000));
      // The route is torn down between surfaces; a fulfill still in flight then
      // lands on an already-handled route, which is noise rather than a finding.
      await r
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"projects":[],"items":[],"runs":[],"schedules":[]}',
        })
        .catch(() => undefined);
    });
    await page.goto(s.route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    findings.push(
      await page.evaluate((route) => {
        const main = (document.querySelector('main') ?? document.body) as HTMLElement;
        const text = main.innerText.trim();
        const spinners = [...document.querySelectorAll('[class*="animate-spin"]')];
        const skeletons = [
          ...document.querySelectorAll(
            '[class*="animate-pulse"],[data-skeleton],[class*="skeleton" i]',
          ),
        ];
        const live = [...document.querySelectorAll('[aria-live],[role="status"]')]
          .map((e) => (e as HTMLElement).innerText.trim())
          .filter(Boolean);
        // A spinner a screen reader cannot announce is a silent wait.
        const labelledSpinners = spinners.filter(
          (sp) =>
            sp.getAttribute('aria-label') ||
            sp.closest('[role="status"],[aria-live]') ||
            sp.querySelector('.sr-only'),
        );
        return {
          route,
          visibleChars: text.length,
          spinners: spinners.length,
          labelledSpinners: labelledSpinners.length,
          skeletons: skeletons.length,
          liveRegionText: live.slice(0, 3),
        };
      }, s.route),
    );
    await page.waitForTimeout(4000);
    await page.unroute(s.api);
  }
  const silent = (
    findings as {
      route: string;
      spinners: number;
      labelledSpinners: number;
      liveRegionText: string[];
    }[]
  )
    .filter((f) => f.spinners > 0 && f.labelledSpinners === 0 && f.liveRegionText.length === 0)
    .map((f) => f.route);
  expect(silent, `spinner with nothing announced on: ${silent.join(', ')}`).toEqual([]);

  const blank = (findings as { route: string; visibleChars: number }[])
    .filter((f) => f.visibleChars < 60)
    .map((f) => f.route);
  expect(blank, `blank while loading: ${blank.join(', ')}`).toEqual([]);
});
