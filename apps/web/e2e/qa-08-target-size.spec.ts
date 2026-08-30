import { test, expect } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const ROUTES = (
  process.env['QA_TARGET_ROUTES'] ?? '/chat,/chat/projects,/chat/library,/tasks,/agi-work'
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

/**
 * WCAG 2.2 SC 2.5.8 Target Size (Minimum): 24x24 CSS px. The "Inline"
 * exception covers links sitting in a sentence, whose size is constrained by
 * the surrounding line-height - the composer disclaimer row is the only such
 * case here, so those are excluded rather than resized.
 */
test.describe('WCAG 2.2 target size', () => {
  test.setTimeout(15 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('every non-inline control is at least 24x24', async ({ page }) => {
    await signIn(page);
    const offenders: string[] = [];

    for (const route of ROUTES) {
      await page
        .goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        .catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(900);

      const small = await page.evaluate(() => {
        const out: { name: string; w: number; h: number }[] = [];
        for (const el of Array.from(
          document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="tab"]'),
        )) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.width >= 24 && rect.height >= 24) continue;
          // SC 2.5.8 "Inline": links sitting in a run of text, whose size is
          // constrained by the surrounding line-height. Marked at the source
          // rather than inferred, so a genuinely small button cannot slip
          // through by happening to sit next to some text.
          if (el.closest('[data-inline-link="true"]')) continue;
          const ownText = (el.textContent ?? '').trim();
          const name = (el.getAttribute('aria-label') || ownText).replace(/\s+/g, ' ').slice(0, 50);
          out.push({ name, w: Math.round(rect.width), h: Math.round(rect.height) });
        }
        return out;
      });

      for (const s of small) offenders.push(`${route} :: ${s.w}x${s.h} "${s.name}"`);
    }

    expect(offenders, `controls under 24x24:\n${offenders.join('\n')}`).toEqual([]);
  });
});
