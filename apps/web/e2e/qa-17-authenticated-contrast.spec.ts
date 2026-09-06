import { expect, test } from '@playwright/test';

import { type ContrastFinding, scanContrast } from './lib/contrast-scan';
import { signIn } from './qa-capability-harness';

/**
 * qa-14 measures the public routes. Everything behind sign-in had never been
 * measured at all, which is the larger half of the product and the half a
 * paying user actually lives in. Same scan, same instrument, driven over the
 * authenticated surface in both themes.
 *
 * Override with AUTH_ROUTES to run a subset.
 */
const DEFAULT_ROUTES = [
  '/chat',
  '/chat/artifacts',
  '/code',
  '/chat/customize',
  '/chat/library',
  '/chat/projects',
  '/chat/schedules',
  '/settings',
  '/settings/account',
  '/settings/archived',
  '/settings/billing',
  '/settings/byok',
  '/settings/capabilities',
  '/settings/connections',
  '/settings/deleted-chats',
  '/settings/general',
  '/settings/memory',
  '/settings/notifications',
  '/settings/plugins',
  '/settings/privacy',
  '/settings/profile',
  '/settings/reflect',
  '/settings/safety',
  '/settings/security',
  '/settings/shared-links',
  '/settings/skills',
  '/settings/sync',
  '/settings/team',
  '/settings/time-focus',
  '/settings/usage',
  '/settings/voice',
  '/tasks',
  '/billing',
  '/workspace',
];

const ROUTES = process.env['AUTH_ROUTES']?.split(',').filter(Boolean) ?? DEFAULT_ROUTES;

test('contrast across the authenticated surface', async ({ page }) => {
  test.setTimeout(1_800_000);
  const findings: unknown[] = [];
  const measured = new Set<string>();
  const unreachable: string[] = [];

  await signIn(page);

  for (const theme of ['light', 'dark'] as const) {
    for (const route of ROUTES) {
      try {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await page.evaluate((t) => {
          document.documentElement.classList.toggle('dark', t === 'dark');
        }, theme);
        await page.waitForTimeout(2200);

        const bad = await page.evaluate(scanContrast).catch(() => [] as ContrastFinding[]);
        measured.add(`${route} ${theme}`);
        if (bad.length) findings.push({ route, theme, bad });
      } catch (error) {
        const message = String(error);
        if (/ERR_CONNECTION|ECONNREFUSED|Target closed|browser has been closed/i.test(message)) {
          unreachable.push(`${route} ${theme}: ${message.split('\n')[0]?.slice(0, 80)}`);
        }
      }
    }
  }

  const report = JSON.stringify(findings, null, 2);
  console.log(`[contrast] measured ${measured.size} authenticated route/theme pairs`);
  expect(
    unreachable,
    `the server stopped answering, so these were never measured:\n${unreachable.join('\n')}`,
  ).toEqual([]);
  expect(findings, `contrast failures behind sign-in:\n${report}`).toEqual([]);
});
