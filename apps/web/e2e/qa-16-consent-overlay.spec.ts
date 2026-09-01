import { expect, test } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The consent banner is fixed to the bottom at z-50 and its card takes pointer
 * events. Once a conversation starts the composer moves to the bottom, under
 * it: measured at 1440x900, the stop button sat at y=789 inside a card
 * spanning y=737-900, and every click on it landed on "Necessary only"
 * instead. A user who has not answered the banner is every first-time visitor,
 * so the one control that interrupts a running response was unreachable for
 * exactly the people most likely to want it.
 *
 * Run in a fresh context so the banner is actually up; a profile that has
 * already answered it cannot see this.
 */
const HELD_OPEN_MS = 15_000;

for (const [label, width, height] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
] as const) {
  test(`the consent banner does not cover the composer at ${label}`, async ({ page }) => {
    test.setTimeout(180_000);

    await page.route('**/chat/completions', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, HELD_OPEN_MS));
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'data: [DONE]\n\n',
      });
    });

    await signIn(page);
    await page.setViewportSize({ width, height });
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const banner = page.locator('[aria-label="Cookie consent"]');
    await expect(banner, 'the banner must be up for this to mean anything').toBeVisible();

    const composer = page.locator('textarea').first();
    await composer.fill('hello there');
    await composer.press('Enter');
    await page.waitForTimeout(2500);

    const reach = await page.evaluate(() => {
      const stop = [...document.querySelectorAll('button')].find((el) =>
        /stop the current/i.test(el.getAttribute('aria-label') ?? ''),
      );
      if (!stop) return { found: false, blockedBy: null };
      const box = stop.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const reachable = top === stop || stop.contains(top);
      return {
        found: true,
        blockedBy: reachable ? null : (top?.textContent ?? top?.tagName ?? '?').trim().slice(0, 40),
      };
    });

    expect(reach.found, 'a running response must offer a way to stop it').toBe(true);
    expect(reach.blockedBy, 'nothing may cover the stop control').toBeNull();

    // Clicking it for real is the assertion that matters: a hit test can pass
    // while an overlay still swallows the event.
    await page
      .getByRole('button', { name: /Stop the current response/i })
      .first()
      .click({
        timeout: 10_000,
      });
  });
}

/**
 * The composer above is on /chat, which has its own layout. Everything else
 * authenticated goes through WebAppShell, and the banner covered those too:
 * measured at 390x844, "Create Your First Schedule" sat at y=699 and the
 * library's Preview, Download and Delete at y=582-643, all inside a banner
 * spanning y=577-844. Two different layouts, so two guards - passing one said
 * nothing about the other.
 */
for (const [route, control] of [
  ['/chat/schedules', /Create Your First Schedule/i],
  ['/chat/library', /^\s*Preview/i],
] as const) {
  test(`${route} keeps its primary control usable under the banner`, async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    await expect(
      page.locator('[aria-label="Cookie consent"]'),
      'the banner must be up for this to mean anything',
    ).toBeVisible();

    const target = page.locator('button', { hasText: control }).first();
    await expect(target, 'the surface must offer its primary control').toBeVisible();

    // Clicking is the assertion. The control may legitimately need scrolling
    // into view; what must not happen is the click landing on the banner.
    await target.scrollIntoViewIfNeeded();
    await target.click({ timeout: 10_000 });
  });
}
