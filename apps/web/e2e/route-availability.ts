import type { Page, Response } from '@playwright/test';

const NOT_FOUND_MARKER = '[data-route-state="not-found"]';
const HEADING_SETTLE_MS = 5_000;

/**
 * Whether the build under test actually serves this route.
 *
 * The answer has to be settled, not sampled. `count()` resolves immediately,
 * so asking it the instant navigation finished read an empty DOM as "served",
 * and the test then spent its whole timeout waiting for an element the
 * not-found page was never going to render. That is what made one of the four
 * tests behind this helper fail while its three siblings skipped: nothing
 * about them differed except which moment they asked.
 *
 * Both the real page and the not-found page render an `h1`, so waiting for the
 * first one to attach turns the race into a decision. A route that renders no
 * heading at all is answered on what is there rather than stalling. The
 * not-found page is recognised by its `data-route-state` marker, never by its
 * copy, which changes with the design system.
 */
export async function routeIsServed(page: Page, response: Response | null): Promise<boolean> {
  if (response?.status() === 404) return false;

  await page
    .locator('h1')
    .first()
    .waitFor({ state: 'attached', timeout: HEADING_SETTLE_MS })
    .catch(() => undefined);

  return (await page.locator(NOT_FOUND_MARKER).count()) === 0;
}
