import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`documentation search at ${viewport.width}px in ${colorScheme}`, () => {
      test.use({
        viewport,
        colorScheme,
        reducedMotion: 'reduce',
        storageState: { cookies: [], origins: [] },
      });

      test('finds an article by body text and supports keyboard navigation and focus restoration', async ({
        page,
      }, testInfo) => {
        expect((await page.goto('/docs'))?.status()).toBe(200);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Documentation', exact: true }),
        ).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(
          page.getByRole('region', { name: 'Cookie consent', exact: true }),
        ).toBeVisible();
        const navigation = page.getByRole('complementary');
        const trigger = navigation.getByRole('button', {
          name: 'Browse documentation',
          exact: true,
        });
        const desktopSearch = navigation.getByRole('button', {
          name: 'Search documentation',
          exact: true,
        });
        const phone = await trigger.isVisible();
        const openFromNavigation = async () => {
          if (await trigger.isVisible()) {
            await trigger.click();
            const drawer = page.getByRole('dialog', { name: 'Documentation', exact: true });
            await expect(drawer).toBeVisible();
            await drawer.getByRole('button', { name: 'Search documentation', exact: true }).click();
            await expect(drawer).toHaveCount(0);
          } else {
            await desktopSearch.click();
          }
        };
        await openFromNavigation();
        await expect(page.getByRole('dialog', { name: 'Search documentation' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Search documentation' })).toHaveCount(0);
        await expect(phone ? trigger : desktopSearch).toBeFocused();
        if (phone) {
          await trigger.focus();
          await page.keyboard.press('Control+k');
          await expect(
            page.getByRole('searchbox', { name: 'Search the help centre' }),
          ).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog', { name: 'Search documentation' })).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await trigger.click();
          await page
            .getByRole('dialog', { name: 'Documentation', exact: true })
            .getByRole('button', { name: 'Search documentation', exact: true })
            .focus();
        } else {
          await desktopSearch.focus();
        }
        await page.keyboard.press('Control+k');
        const dialog = page.getByRole('dialog', { name: 'Search documentation', exact: true });
        await expect(dialog).toHaveCount(1);
        await expect(page.getByRole('dialog', { name: 'Documentation', exact: true })).toHaveCount(
          0,
        );
        const input = dialog.getByRole('searchbox', { name: 'Search the help centre' });
        await expect(input).toBeFocused();
        let searches = 0;
        page.on('request', (request) => {
          if (new URL(request.url()).pathname === '/api/help/search') searches += 1;
        });
        const searchResponse = page.waitForResponse(
          (response) => new URL(response.url()).pathname === '/api/help/search',
        );
        await input.fill('ambient');
        expect((await searchResponse).status()).toBe(200);
        const match = dialog.getByRole('link', {
          name: /^Search: the web, your chats and the help centre/,
        });
        await expect(match).toHaveCount(1);
        await expect(match).toHaveAttribute('href', /^\/help\/search(?:#[a-z0-9-]+)?$/);
        await expect(dialog.getByRole('status')).toHaveAttribute('aria-live', 'polite');
        await page.keyboard.press('Shift+Tab');
        await expect(
          dialog.getByRole('button', { name: 'Close documentation search' }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(input).toBeFocused();
        const results = dialog.getByRole('link');
        const first = results.first();
        expect(
          await first.evaluate((element) => {
            const rects = Array.from(element.getClientRects()).filter(
              (rect) => rect.width > 0 && rect.height > 0,
            );
            return (
              rects.length > 0 &&
              rects.every((rect) => {
                const target = document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                );
                return target === element || (target !== null && element.contains(target));
              })
            );
          }),
          'Each visible line of the result link must receive pointer input above the delayed cookie notice',
        ).toBe(true);
        await page.keyboard.press('ArrowDown');
        await expect(first).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(input).toBeFocused();
        await page.keyboard.press('Control+k');
        await expect(dialog).toHaveCount(1);
        await expect(input).toBeFocused();
        expect(searches).toBe(1);
        expect(
          await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
        ).toBeLessThanOrEqual(0);
        const geometry = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            viewport: { width: innerWidth, height: innerHeight },
            maxHeight: style.maxHeight,
            overflowY: style.overflowY,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            zIndex: style.zIndex,
            fontsStatus: document.fonts.status,
            faces: Array.from(document.fonts).map((face) => ({
              family: face.family,
              status: face.status,
            })),
          };
        });
        await testInfo.attach('documentation-search-geometry', {
          body: JSON.stringify(geometry, null, 2),
          contentType: 'application/json',
        });
        expect(geometry.rect.x).toBeGreaterThanOrEqual(0);
        expect(geometry.rect.y).toBeGreaterThanOrEqual(0);
        expect(geometry.rect.x + geometry.rect.width).toBeLessThanOrEqual(geometry.viewport.width);
        expect(geometry.rect.y + geometry.rect.height).toBeLessThanOrEqual(
          geometry.viewport.height,
        );
        expect(geometry.rect.height).toBeLessThanOrEqual(Number.parseFloat(geometry.maxHeight) + 1);
        expect(geometry.fontsStatus).toBe('loaded');
        await page.screenshot({
          path: testInfo.outputPath('documentation-search.png'),
          fullPage: false,
        });
        if (viewport.width === 1440) await page.setViewportSize({ width: 390, height: 844 });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        if (viewport.width === 1440) {
          await expect(trigger).toBeFocused();
          await page.setViewportSize(viewport);
        } else {
          await expect(trigger).toBeFocused();
        }
        await openFromNavigation();
        await input.fill('ambient');
        await expect(match).toBeVisible();
        const path = await match.getAttribute('href');
        if (!path) throw new Error('Canonical article search path is missing');
        await match.click();
        await expect
          .poll(() => {
            const url = new URL(page.url());
            return `${url.pathname}${url.hash}`;
          })
          .toBe(path);
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Search: the web, your chats and the help centre',
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByRole('dialog', { name: 'Search documentation' })).toHaveCount(0);
        if (new URL(page.url()).hash) {
          expect(
            await page.evaluate(
              () => document.getElementById(decodeURIComponent(location.hash.slice(1))) !== null,
            ),
          ).toBe(true);
        }
      });
    });
  }
}
