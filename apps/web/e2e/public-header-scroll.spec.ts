import AxeBuilder from '@axe-core/playwright';
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

      test(`keeps the decorative edge below readable raw-axe header content in ${colorScheme}`, async ({
        page,
      }, info) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        expect((await page.goto('/pricing'))?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
        const header = page.locator('header.agi-ds-header');
        const surface = header.locator('.agi-ds-header-surface');
        const edge = surface.locator(':scope > .agi-ds-header-edge');
        await expect(edge).toHaveCount(1);
        await expect(edge).toHaveAttribute('aria-hidden', 'true');
        await expect(header.getByRole('link', { name: 'Try AGI Chat', exact: true })).toBeVisible();
        const records: unknown[] = [];
        for (const scroll of [0, 600, 0]) {
          await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), scroll);
          if (scroll) await expect(header).toHaveAttribute('data-scrolled', 'true');
          else await expect(header).not.toHaveAttribute('data-scrolled');
          const geometry = await surface.evaluate((element) => {
            const decoration = element.querySelector(':scope > .agi-ds-header-edge');
            if (!(decoration instanceof HTMLElement)) throw new Error('Header edge is missing');
            const parentRect = element.getBoundingClientRect();
            const edgeRect = decoration.getBoundingClientRect();
            const parentStyle = getComputedStyle(element);
            const edgeStyle = getComputedStyle(decoration);
            const reference = document.createElement('div');
            reference.style.cssText =
              'position:absolute;visibility:hidden;width:0;pointer-events:none;';
            reference.style.blockSize = 'var(--space-6)';
            reference.style.background = `linear-gradient(to bottom, ${parentStyle.backgroundColor}, transparent)`;
            document.documentElement.append(reference);
            let referenceHeight;
            let referenceGradient;
            try {
              referenceHeight = reference.getBoundingClientRect().height;
              referenceGradient = getComputedStyle(reference).backgroundImage;
            } finally {
              reference.remove();
            }
            return {
              surface: {
                top: parentRect.top,
                bottom: parentRect.bottom,
                left: parentRect.left,
                right: parentRect.right,
              },
              edge: {
                top: edgeRect.top,
                bottom: edgeRect.bottom,
                left: edgeRect.left,
                right: edgeRect.right,
                height: edgeRect.height,
              },
              position: edgeStyle.position,
              pointerEvents: edgeStyle.pointerEvents,
              zIndex: edgeStyle.zIndex,
              gradient: edgeStyle.backgroundImage,
              referenceGradient,
              referenceHeight,
              surfaceBackground: parentStyle.backgroundColor,
              lastChild: element.lastElementChild === decoration,
              afterContent: getComputedStyle(element, '::after').content,
            };
          });
          expect(geometry.lastChild).toBe(true);
          expect(geometry.position).toBe('absolute');
          expect(geometry.pointerEvents).toBe('none');
          expect(geometry.zIndex).toBe('auto');
          expect(['none', 'normal']).toContain(geometry.afterContent);
          expect(geometry.edge.top).toBeCloseTo(geometry.surface.bottom, 2);
          expect(geometry.edge.left).toBeCloseTo(geometry.surface.left, 2);
          expect(geometry.edge.right).toBeCloseTo(geometry.surface.right, 2);
          expect(geometry.referenceHeight).toBeGreaterThan(0);
          expect(geometry.edge.height).toBeCloseTo(geometry.referenceHeight!, 2);
          expect(geometry.gradient).toBe(geometry.referenceGradient);
          const accessibility = await new AxeBuilder({ page })
            .include('.agi-ds-header-surface')
            .withRules(['color-contrast'])
            .analyze();
          expect(accessibility.violations).toEqual([]);
          expect(accessibility.incomplete).toEqual([]);
          records.push({ scroll, geometry, accessibility });
        }
        await info.attach('header-edge-geometry-and-raw-axe.json', {
          body: JSON.stringify(records, null, 2),
          contentType: 'application/json',
        });
      });

      test(`keeps navigation and the action stable across scrolling in ${colorScheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        expect((await page.goto('/pricing'))?.status()).toBe(200);
        const header = page.locator('header.agi-ds-header');
        const surface = header.locator('.agi-ds-header-surface');
        const action = header.getByRole('link', { name: 'Try AGI Chat', exact: true });
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
