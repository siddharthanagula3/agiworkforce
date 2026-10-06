import { expect, test } from '@playwright/test';
import { measurePublicFontProof } from './lib/public-page-readiness';

for (const viewport of [
  { width: 1180, height: 757 },
  { width: 390, height: 844 },
]) {
  test.describe(`public header at ${viewport.width}px`, () => {
    test.use({ viewport });

    for (const colorScheme of ['dark', 'light'] as const) {
      if (viewport.width >= 768) {
        test(`first pointer activation opens the company menu and repeated activation toggles it in ${colorScheme}`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          expect((await page.goto('/security'))?.status()).toBe(200);
          const nav = page.getByRole('navigation', { name: 'Primary' });
          const group = nav.locator('.agi-ds-navgroup').filter({
            has: page.getByRole('button', { name: 'Company', exact: true }),
          });
          await expect(group).toHaveCount(1);
          const trigger = group.getByRole('button', { name: 'Company', exact: true });
          const panel = group.locator('.agi-ds-navpanel');
          await expect(panel).toHaveCount(1);
          await expect(trigger).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.mouse.move(viewport.width - 1, viewport.height - 1);
          await expect(trigger).toHaveAttribute('aria-expanded', 'false');
          await expect(panel).toBeHidden();
          await expect(nav.locator('.agi-ds-navpanel:not([hidden])')).toHaveCount(0);

          await trigger.click();
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          await expect(panel).toBeVisible();
          await expect(panel.getByRole('link').first()).toBeVisible();
          await expect(nav.locator('.agi-ds-navpanel:not([hidden])')).toHaveCount(1);

          await trigger.click();
          await expect(trigger).toHaveAttribute('aria-expanded', 'false');
          await expect(panel).toBeHidden();
          await expect(nav.locator('.agi-ds-navpanel:not([hidden])')).toHaveCount(0);

          await trigger.click();
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          await expect(panel).toBeVisible();
          await trigger.press('Escape');
          await expect(panel).toBeHidden();
          await expect(trigger).toBeFocused();

          await trigger.press('Space');
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          await expect(panel).toBeVisible();
          await trigger.press('Space');
          await expect(trigger).toHaveAttribute('aria-expanded', 'false');
          await expect(panel).toBeHidden();

          await page.mouse.move(viewport.width - 1, viewport.height - 1);
          await trigger.hover();
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          await expect(panel).toBeVisible();
          await trigger.press('Space');
          await expect(trigger).toHaveAttribute('aria-expanded', 'false');
          await expect(panel).toBeHidden();
        });
        test(`opened menus have readable, fitting text in ${colorScheme}`, async ({ page }) => {
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          expect((await page.goto('/security'))?.status()).toBe(200);
          const nav = page.getByRole('navigation', { name: 'Primary' });
          for (const label of ['Product', 'Features', 'Solutions', 'Developers', 'Company']) {
            const trigger = nav.getByRole('button', { name: label, exact: true });
            await trigger.focus();
            await trigger.press('Space');
            await expect(trigger).toHaveAttribute('aria-expanded', 'true');
            const panel = nav.locator('.agi-ds-navpanel:not([hidden])');
            await expect(panel).toHaveCount(1);
            await page.evaluate(() => document.fonts.ready);
            const fonts = [{ cssVariable: '--font-geist-sans' }];
            if ((await panel.locator('.agi-ds-navpanel-footer').count()) > 0) {
              fonts.push({ cssVariable: '--font-geist-mono' });
            }
            const font = await measurePublicFontProof(page, panel, fonts);
            expect(font.fontCoverageGaps).toEqual([]);
            const state = await panel.evaluate((root) => {
              const rect = root.getBoundingClientRect();
              return {
                left: rect.left,
                right: rect.right,
                rows: [
                  ...root.querySelectorAll(
                    '.agi-ds-navpanel-title,.agi-ds-navpanel-desc,.agi-ds-navpanel-footer',
                  ),
                ].map((element) => {
                  const style = getComputedStyle(element);
                  const range = document.createRange();
                  range.selectNodeContents(element);
                  const boxes = [...range.getClientRects()].filter(
                    (box) => box.width > 0 && box.height > 0,
                  );
                  return {
                    text: element.textContent?.trim(),
                    footer: element.matches('.agi-ds-navpanel-footer'),
                    size: Number.parseFloat(style.fontSize),
                    font: style.fontFamily,
                    painted: boxes.length > 0,
                    fits: boxes.every(
                      (box) =>
                        box.left >= rect.left &&
                        box.right <= rect.right &&
                        box.top >= rect.top &&
                        box.bottom <= rect.bottom,
                    ),
                  };
                }),
              };
            });
            expect(state.left).toBeGreaterThanOrEqual(0);
            expect(state.right).toBeLessThanOrEqual(viewport.width);
            expect(state.rows.length).toBeGreaterThan(0);
            for (const row of state.rows) {
              expect(row.text).toBeTruthy();
              expect(row.size).toBeGreaterThanOrEqual(row.footer ? 15 : 17);
              expect(row.font).toMatch(row.footer ? /^"?Geist Mono/ : /^"?Geist,/);
              expect(row.painted).toBe(true);
              expect(row.fits, row.text).toBe(true);
            }
            await trigger.press('Escape');
            await expect(trigger).toHaveAttribute('aria-expanded', 'false');
          }
        });
      }

      test(`keeps navigation and the action stable across scrolling in ${colorScheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        expect((await page.goto('/pricing'))?.status()).toBe(200);
        const header = page.locator('header.agi-ds-header');
        const surface = header.locator('.agi-ds-header-surface');
        const action = header.getByRole('link', { name: 'Try AGI Web', exact: true });
        await expect(action).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(header).not.toHaveAttribute('data-scrolled');
        const before = await page
          .locator('main')
          .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        const actionBefore = await action.boundingBox();
        await page.evaluate(() => window.scrollTo(0, 600));
        await expect(header).toHaveAttribute('data-scrolled', 'true');
        await expect(action).toBeVisible();
        const after = await page
          .locator('main')
          .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
        expect((await action.boundingBox())?.x).toBe(actionBefore?.x);
        if (viewport.width >= 768) {
          expect((await surface.boundingBox())?.height).toBeLessThanOrEqual(48);
          await expect(header.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
            'aria-current',
            'page',
          );
        } else {
          await header.getByRole('button', { name: 'Menu', exact: true }).click();
          const menu = page.getByRole('dialog');
          await expect(menu.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
            'aria-current',
            'page',
          );
          await page.keyboard.press('Escape');
        }
        expect(await surface.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
          'none',
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(header).not.toHaveAttribute('data-scrolled');
      });
    }

    test('identifies the current page inside its navigation group', async ({ page }) => {
      expect((await page.goto('/security'))?.status()).toBe(200);
      if (viewport.width >= 768) {
        const nav = page.getByRole('navigation', { name: 'Primary' });
        await nav.locator('[data-current="true"] > button').click();
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(nav.locator('[aria-current="page"]')).toBeVisible();
        await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('href', '/security');
      } else {
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        const nav = page.getByRole('dialog').getByRole('navigation', { name: 'Site' });
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('href', '/security');
      }
    });
  });
}
