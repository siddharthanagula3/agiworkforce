import { expect, test } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The connector tool-permission panel is the one place a user chooses whether
 * a connector may act without asking, so its modal contract and its targets
 * matter. The QA account has no connected connectors, so nothing on this
 * surface renders for it and a live sweep sees an empty table - the panel was
 * uncovered for that reason alone, not because it is hard to reach. Injecting
 * the connector list at the route boundary puts the real component in the real
 * page, which is how the 24x16 Retry target below was found.
 */
const CONNECTED = ['notion', 'github', 'slack'];
const STAMP = '2026-08-20T10:00:00.000Z';
const MIN_TARGET = 24;

test.describe('connector tool permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/connectors', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connectors: CONNECTED.map((connectorId, i) => ({
            id: `conn-${i}`,
            connectorId,
            authType: 'oauth',
            connectedAt: STAMP,
            updatedAt: STAMP,
            source: 'user',
            health: 'connected',
          })),
          available: CONNECTED,
        }),
      });
    });
    await page.route('**/api/connectors/permissions**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ permissions: [] }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
  });

  for (const [label, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ] as const) {
    test(`the panel honours the modal contract at ${label}`, async ({ page }) => {
      test.setTimeout(180_000);
      await signIn(page);
      await page.setViewportSize({ width, height });
      await page.goto('/settings/connectors', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);

      await page.getByRole('button', { name: 'Notion', exact: true }).first().click();
      await page.waitForTimeout(2000);

      const trigger = page.getByRole('button', { name: /Tool permissions/i }).first();
      await expect(trigger, 'a connected connector must offer tool permissions').toBeVisible();

      const opened = await page.locator('[role="dialog"]').count();
      await trigger.click();
      await page.waitForTimeout(1500);
      const panel = page.locator('[role="dialog"]').last();
      await expect(panel).toBeVisible();

      const contract = await panel.evaluate((root, min) => {
        const small: string[] = [];
        for (const el of root.querySelectorAll('button,[role="radio"],[role="tab"],a')) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 && r.height < 1) continue;
          if (r.width < min || r.height < min) {
            small.push(
              `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ` +
                `${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        }
        const box = root.getBoundingClientRect();
        return {
          ariaModal: root.getAttribute('aria-modal'),
          labelled: Boolean(
            root.getAttribute('aria-label') ?? root.getAttribute('aria-labelledby'),
          ),
          overflows: box.right > window.innerWidth + 1 || box.bottom > window.innerHeight + 1,
          small,
        };
      }, MIN_TARGET);

      expect(contract.ariaModal, 'a modal panel must say so').toBe('true');
      expect(contract.labelled, 'a dialog needs an accessible name').toBe(true);
      expect(contract.overflows, `the panel must fit ${width}px`).toBe(false);
      expect(contract.small, 'every control needs a 24px target').toEqual([]);

      const beforeEscape = await page.locator('[role="dialog"]').count();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      const afterEscape = await page.locator('[role="dialog"]').count();

      expect(afterEscape, 'Escape must close the topmost dialog only').toBe(beforeEscape - 1);
      expect(afterEscape, 'the settings modal underneath must stay open').toBe(opened);
      expect(
        await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
        'focus must return into the dialog underneath',
      ).toBe(true);
    });
  }
});
