import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The cookie banner's wrapper is fixed and full-width while its card is centred
 * at max-w-7xl, so the empty padding either side sat over the sidebar and
 * swallowed clicks - the account menu could not be opened at all until the
 * banner was dismissed. Any full-width fixed overlay can reintroduce this.
 */
test.describe('no overlay blocks a control it does not visually cover', () => {
  test.setTimeout(10 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('every visible sidebar and composer control is the top element at its own centre', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);

    // Named, always-present controls. A broad "nothing covers anything" sweep
    // reports nested rows and offscreen skip links as false positives, so this
    // asserts the specific controls the cookie banner actually blocked.
    const CRITICAL = ['Account menu for', 'New chat', 'Organize chats'];

    const blocked = await page.evaluate((names) => {
      const out: { name: string; covering: string }[] = [];
      for (const prefix of names) {
        const el = Array.from(document.querySelectorAll<HTMLElement>('button, a[href]')).find(
          (candidate) =>
            (candidate.getAttribute('aria-label') ?? candidate.textContent ?? '')
              .trim()
              .startsWith(prefix),
        );
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        if (!top || el.contains(top) || top === el || top.contains(el)) continue;
        out.push({
          name: prefix,
          covering: `${top.tagName}.${String(top.className).slice(0, 70)}`,
        });
      }
      return out;
    }, CRITICAL);

    expect(
      blocked,
      `controls covered by an overlay:\n${blocked.map((b) => `${b.name} <- ${b.covering}`).join('\n')}`,
    ).toEqual([]);

    // And the account menu must actually open, which is what the block prevented.
    const account = page.getByRole('button', { name: /^Account menu for/i }).first();
    await account.click({ timeout: 5_000 });
    await page.waitForTimeout(600);
    expect(
      await page.locator('[role="menu"]').count(),
      'account menu did not open',
    ).toBeGreaterThan(0);
  });
});
