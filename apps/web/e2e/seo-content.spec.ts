import { expect, test, type Page } from '@playwright/test';
import { SUBSCRIPTION_GUIDE } from '../lib/blog-posts';
import { PAID_UPGRADE_ACCESS_NOTE } from '../lib/billing/paid-upgrade-copy';

const routes = [
  '/',
  '/web',
  '/pricing',
  '/blog',
  SUBSCRIPTION_GUIDE.path,
  '/about',
  '/desktop',
  '/docs',
  '/trust',
] as const;

test.describe('public branding and ribbon motion', () => {
  test('keeps visible branding symbolic and search identity named', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AGIWORKFORCE/);
    const home = page.locator('.agi-ds-header-row > .agi-ds-wordmark');
    await expect(home).toHaveAttribute('aria-label', 'AGIWORKFORCE');
    await expect(home).toHaveText('');
    await expect(home.locator('img')).toHaveCount(1);
    await expect(page.locator('.agi-fl-hero-brand')).toHaveCount(0);
    await expect(page.locator('.agi-fl-hero-brand-mark')).toHaveAttribute('alt', 'AGIWORKFORCE');
    await expect(page.locator('.agi-ds-footer-wordmark')).toHaveText('');
    await expect(page.getByText('The AI application suite', { exact: true })).toHaveCount(0);
    await expect(page.locator('.agi-fl-hero-lede')).toHaveCount(0);
    await expect(page.locator('.agi-fl-hero .agi-fl-announce')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Product facts', exact: true })).toHaveCount(0);
    await expect(page.getByText('models in the catalogue', { exact: true })).toHaveCount(0);
    const surfaces = page.getByRole('heading', { name: 'Six surfaces.', exact: true });
    const routing = page.getByRole('heading', {
      name: 'Every model. One router. Your call.',
      exact: true,
    });
    const order = await surfaces.evaluate((element) => {
      const section = element.closest('section');
      return section?.nextElementSibling?.querySelector('h2')?.textContent;
    });
    await expect(routing).toHaveCount(1);
    expect(order).toBe('Every model. One router. Your call.');
    await page.goto('/pricing');
    await expect(page.locator('main')).not.toContainText(
      /Managed Cloud|Managed usage|Managed sandboxes/,
    );
  });

  test('circulates ribbon material inside a fixed outline and supports pause and reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
    await page.goto('/');
    const symbol = page.locator('.agi-fl-hero-symbol');
    const mark = symbol.locator('img');
    const mesh = symbol.locator('canvas');
    await expect(symbol).toHaveAttribute('data-motion', 'ready');
    await expect(symbol.locator('.agi-mark-shine')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.agi-fl-hero-brand-wrap').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const originalBounds = await symbol.boundingBox();
    const sample = () =>
      mesh.evaluate(
        (element) =>
          new Promise<{ alpha: number; color: number; pixels: number }>((resolve) => {
            requestAnimationFrame(() => {
              const canvas = element as HTMLCanvasElement;
              const gl = canvas.getContext('webgl')!;
              const pixels = new Uint8Array(canvas.width * canvas.height * 4);
              gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
              let alpha = 2166136261;
              let color = 2166136261;
              let filled = 0;
              for (let index = 3; index < pixels.length; index += 4) {
                alpha = Math.imul(alpha ^ pixels[index]!, 16777619);
                color = Math.imul(color ^ pixels[index - 3]!, 16777619);
                color = Math.imul(color ^ pixels[index - 2]!, 16777619);
                color = Math.imul(color ^ pixels[index - 1]!, 16777619);
                if (pixels[index]! > 0) filled += 1;
              }
              resolve({ alpha, color, pixels: filled });
            });
          }),
      );
    await page.waitForTimeout(200);
    const first = await sample();
    await page.waitForTimeout(700);
    const second = await sample();
    expect(first.pixels).toBeGreaterThan(0);
    expect(second.pixels).toBeGreaterThan(0);
    expect(second.alpha).toBe(first.alpha);
    expect(second.color).not.toBe(first.color);
    expect(await symbol.boundingBox()).toEqual(originalBounds);
    await expect(mesh).toHaveCSS('transform', 'none');
    await page.getByRole('button', { name: 'Pause symbol animation' }).click();
    const still = await mesh.screenshot();
    await page.waitForTimeout(200);
    expect((await mesh.screenshot()).equals(still)).toBe(true);
    await page.getByRole('button', { name: 'Resume symbol animation' }).click();
    await page.waitForTimeout(4500);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(symbol).toHaveAttribute('data-motion', 'static');
    await expect(symbol).toBeDisabled();
    await expect(mesh).toBeHidden();
    await expect(mark).toHaveCSS('opacity', '1');
  });

  test('keeps the original symbol available if its rendering context is lost', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const symbol = page.locator('.agi-fl-hero-symbol');
    await expect(symbol).toHaveAttribute('data-motion', 'ready');
    await symbol.locator('canvas').evaluate((element) => {
      const gl = (element as HTMLCanvasElement).getContext('webgl')!;
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('Context-loss probe is unavailable');
      extension.loseContext();
    });
    await expect(symbol).toHaveAttribute('data-motion', 'static');
    await expect(symbol).toBeDisabled();
    await expect(symbol.locator('img')).toHaveCSS('opacity', '1');
    await expect(symbol.locator('canvas')).toHaveCSS('opacity', '0');
  });
});

test.describe('public buying guidance', () => {
  test.use({ reducedMotion: 'reduce', locale: 'en-US' });
  const runtimeErrors = new WeakMap<Page, string[]>();

  test.beforeEach(({ page }) => {
    const errors: string[] = [];
    runtimeErrors.set(page, errors);
    page.on('pageerror', (error) => errors.push(error.message));
  });

  test.afterEach(({ page }) => {
    expect(runtimeErrors.get(page)).toEqual([]);
  });

  test('connects the index, guide, metadata and discovery feeds', async ({ page, request }) => {
    const response = await page.goto('/blog');
    expect(response?.status()).toBe(200);
    await expect(page.locator('button.agi-ds-theme-toggle')).toHaveCount(1);
    await page.getByRole('link', { name: SUBSCRIPTION_GUIDE.title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${SUBSCRIPTION_GUIDE.path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SUBSCRIPTION_GUIDE.title);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${SUBSCRIPTION_GUIDE.path}$`),
    );
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).not.toContain(
      'noindex',
    );

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const schemas = blocks.map((block) => JSON.parse(block) as Record<string, unknown>);
    const article = schemas.find((schema) => schema['@type'] === 'Article');
    expect(article).toMatchObject({
      headline: await page.locator('h1').innerText(),
      dateModified: SUBSCRIPTION_GUIDE.updated,
    });
    expect(schemas.some((schema) => schema['@type'] === 'BreadcrumbList')).toBe(true);
    await expect(page.locator('time')).toHaveAttribute('datetime', SUBSCRIPTION_GUIDE.updated);
    await expect(page.getByRole('table')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'OpenAI’s current guidance' })).toHaveAttribute(
      'href',
      'https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites',
    );

    const xml = await request.get('/sitemap.xml');
    expect(xml.status()).toBe(200);
    expect(await xml.text()).toContain(SUBSCRIPTION_GUIDE.path);
    const missing = await request.get('/blog/this-guide-does-not-exist');
    expect(missing.status()).toBe(404);
  });

  test('keeps plan conditions and buying guidance below the pricing cards', async ({ page }) => {
    await page.goto('/pricing');
    const notice = page.getByText(PAID_UPGRADE_ACCESS_NOTE, { exact: true });
    await expect(notice).toBeVisible();
    expect(
      await notice.evaluate((element) => {
        const cards = document.querySelector('#pricing-individual-plans');
        return (
          cards !== null &&
          Boolean(element.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_PRECEDING)
        );
      }),
    ).toBe(true);
    await expect(
      page.getByRole('link', { name: 'Compare a multi-model plan with separate AI subscriptions' }),
    ).toHaveAttribute('href', SUBSCRIPTION_GUIDE.path);
  });

  for (const route of routes) {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 1024, 390, 320]) {
        test(`${route} is readable at ${width}px in ${theme}`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme: theme });
          const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
          expect(response?.status()).toBe(200);
          await expect(page.locator('h1')).toBeVisible();
          await expect(page.locator('button.agi-ds-theme-toggle')).toHaveCount(1);
          await expect(page.locator('[data-route-state="not-found"]')).toHaveCount(0);
          await page.evaluate(async () => {
            await document.fonts.ready;
            for (let position = 0; position < document.body.scrollHeight; position += innerHeight) {
              scrollTo(0, position);
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            scrollTo(0, 0);
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          });
          const layout = await page.evaluate(() => ({
            viewport: innerWidth,
            page: document.documentElement.scrollWidth,
            theme: document.documentElement.getAttribute('data-theme'),
          }));
          expect(layout.theme).toBe(theme);
          expect(layout.page).toBeLessThanOrEqual(layout.viewport);
          await expect(page.locator('h1')).toHaveCount(1);
          const necessaryCookies = page.getByRole('button', {
            name: 'Necessary only',
            exact: true,
          });
          if (await necessaryCookies.isVisible()) {
            await necessaryCookies.click();
            await expect(page.locator('[data-cookie-banner]')).toHaveCount(0);
          }
          const labels = await page
            .locator(
              '[data-design="agi"] :is(.agi-ds-eyebrow, .agi-fl-eyebrow, .agi-lp-eyebrow, .agi-section-eyebrow, .agi-product-hero-eyebrow, .agi-ds-bento-eyebrow, .agi-ds-pagehead-label)',
            )
            .evaluateAll((elements) =>
              elements.map((element) => {
                const style = getComputedStyle(element);
                return {
                  text: element.textContent,
                  transform: style.textTransform,
                  tracking: style.letterSpacing,
                  font: style.fontFamily,
                  prefix: getComputedStyle(element, '::before').content,
                };
              }),
            );
          for (const label of labels) {
            expect(label.transform, label.text ?? '').toBe('none');
            expect(['normal', '0px'], label.text ?? '').toContain(label.tracking);
            expect(label.font, label.text ?? '').not.toMatch(/mono/i);
            expect(['none', 'normal', '""'], label.text ?? '').toContain(label.prefix);
          }
          if (route === SUBSCRIPTION_GUIDE.path) {
            await expect(page.locator('main')).toContainText('These are assumed inputs');
            await expect(page.locator('main')).toContainText(
              'Agreement between models is not proof',
            );
          }
          if (route === '/web') {
            await expect(page.locator('.agi-fl-hero')).toContainText(
              'Model access and research tools depend',
            );
            await expect(page.locator('.agi-fl-hero')).toContainText('public alpha');
            const question = page.locator('figure[data-scene="research-ask"]');
            const measurement = await question.evaluate((frame) => {
              const composer = frame.querySelector('.agi-app-composer');
              if (!composer) throw new Error('The Ask preview must contain a composer.');
              const frameBox = frame.getBoundingClientRect();
              const composerBox = composer.getBoundingClientRect();
              const draft = composer.querySelector('.agi-app-draft');
              if (!draft) throw new Error('The Ask preview must contain its question.');
              const sentence = document.createRange();
              sentence.selectNodeContents(draft);
              return {
                frameWidth: frameBox.width,
                composerWidth: composerBox.width,
                composerHeight: composerBox.height,
                share: composerBox.width / frameBox.width,
                sentenceLines: sentence.getClientRects().length,
              };
            });
            expect(measurement.share).toBeLessThanOrEqual(0.75);
            expect(measurement.share).toBeGreaterThan(0.6);
            expect(measurement.sentenceLines).toBe(1);
            await testInfo.attach('ask-scale', {
              body: JSON.stringify(measurement),
              contentType: 'application/json',
            });
            const toolbar = await question.locator('.agi-app-composer-row').evaluate((row) =>
              [...row.children].map((child) => {
                const box = child.getBoundingClientRect();
                return box.top + box.height / 2;
              }),
            );
            expect(Math.max(...toolbar) - Math.min(...toolbar)).toBeLessThanOrEqual(1);
            await question.scrollIntoViewIfNeeded();
            await question.screenshot({ path: testInfo.outputPath('research-ask.png') });
          }
          if (route === '/pricing') {
            await expect(page.locator('#pricing-individual-plans .agi-tier-name')).toHaveText([
              'Free',
              'Basic',
              'Premium',
              'Max',
              'Ultra',
            ]);
            await expect(page.locator('#pricing-individual-plans')).toContainText(
              'No session limit',
            );
            await expect(page.locator('#pricing-ultra-usage-note')).toContainText(
              'Weekly and monthly allowances',
            );
            const cardFeatures = await page
              .locator('#pricing-individual-plans .agi-tier-features')
              .allTextContents();
            for (const features of cardFeatures) expect(features).not.toMatch(/\d/);
            const comparisonValues = (label: string) =>
              page
                .getByRole('row')
                .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
                .getByRole('cell');
            await expect(comparisonValues('Knowledge storage')).toHaveText([
              '100 MB',
              '1 GB',
              '10 GB',
              '50 GB',
              '100 GB',
            ]);
            await expect(comparisonValues('File downloads a month')).toHaveText([
              '775 MB',
              '1 GB',
              '3 GB',
              '15 GB',
              '30 GB',
            ]);
            await expect(comparisonValues('Chats at once')).toHaveText(['1', '1', '3', '5', '10']);
            await page.getByRole('button', { name: 'Team & Enterprise', exact: true }).click();
            await page.locator('#team-seat-count').fill('3');
            await page.getByRole('button', { name: 'Individual', exact: true }).click();
            await expect(page.locator('#pricing-individual-plans')).toBeVisible();
            await expect(page.locator('.agi-compare-plan-name')).toHaveText([
              'Free',
              'Basic',
              'Premium',
              'Max',
              'Ultra',
            ]);
            await page.evaluate(async () => {
              scrollTo(0, 0);
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            });
            await page.screenshot({ path: testInfo.outputPath('individual.png') });
            await page
              .locator('#pricing-individual-plans')
              .screenshot({ path: testInfo.outputPath('individual-plans.png') });
            await page.getByRole('button', { name: 'Team & Enterprise', exact: true }).click();
            await expect(page.locator('#team-seat-count')).toHaveValue('3');
            await expect(page.locator('#pricing-individual-plans')).toBeHidden();
            await expect(page.locator('.agi-compare-plan-name')).toHaveText(['Team', 'Enterprise']);
            const audienceLayout = await page.evaluate(() => {
              const team = document.querySelector('.agi-tier--band')!.getBoundingClientRect();
              const enterprise = document
                .querySelector('.agi-pricing-enterprise')!
                .getBoundingClientRect();
              const title = document.querySelector('h1')!.getBoundingClientRect();
              const toggle = document
                .querySelector('.agi-pricing-audience')!
                .getBoundingClientRect();
              return {
                teamTop: team.top,
                teamBottom: team.bottom,
                enterpriseTop: enterprise.top,
                titleCenter: title.left + title.width / 2,
                toggleCenter: toggle.left + toggle.width / 2,
                viewport: innerWidth,
              };
            });
            expect(
              Math.abs(audienceLayout.titleCenter - audienceLayout.viewport / 2),
            ).toBeLessThanOrEqual(1);
            expect(
              Math.abs(audienceLayout.toggleCenter - audienceLayout.viewport / 2),
            ).toBeLessThanOrEqual(1);
            if (width >= 1024)
              expect(
                Math.abs(audienceLayout.teamTop - audienceLayout.enterpriseTop),
              ).toBeLessThanOrEqual(1);
            else
              expect(audienceLayout.enterpriseTop).toBeGreaterThanOrEqual(
                audienceLayout.teamBottom,
              );
            const team = page.locator('.agi-tier--band');
            await team.scrollIntoViewIfNeeded();
            await team.screenshot({ path: testInfo.outputPath('team-plan.png') });
          }
          if (route === '/') {
            await expect(page.locator('.agi-fl-hero .agi-fl-lede')).toHaveCount(0);
            await expect(page.locator('.agi-fl-hero .agi-fl-announce')).toHaveCount(0);
            const mark = await page.locator('.agi-fl-hero-brand-mark').boundingBox();
            const copy = await page.locator('.agi-fl-hero-copy').boundingBox();
            expect(mark).not.toBeNull();
            expect(copy).not.toBeNull();
            expect(mark!.width).toBeGreaterThanOrEqual(128);
            expect(Math.abs(mark!.x + mark!.width / 2 - copy!.x - copy!.width / 2)).toBeLessThan(1);
          }
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
          await page.screenshot({ path: testInfo.outputPath('viewport.png') });
        });
      }
    }
  }
});

test.describe('shared public footer layout', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 1024, 390, 320]) {
      test(`keeps footer geometry consistent at ${width}px in ${theme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        const samples = [];
        for (const route of ['/', '/pricing', '/web', '/blog']) {
          await page.goto(route);
          await page.evaluate(() => document.fonts.ready);
          const footer = page.locator('footer.agi-footer-responsive');
          await footer.scrollIntoViewIfNeeded();
          samples.push(
            await footer.evaluate((element) => {
              const container = element.querySelector('.agi-ds-container')!;
              const box = container.getBoundingClientRect();
              const links = [...element.querySelectorAll('.agi-ds-footer-link')];
              const legal = [...element.querySelectorAll('.agi-ds-footer-legal-nav > *')];
              const style = getComputedStyle(links[0]!);
              return {
                width: box.width,
                x: box.x,
                font: style.fontFamily,
                size: style.fontSize,
                leading: style.lineHeight,
                columns: links.map((link) => ({
                  x: link.getBoundingClientRect().x - box.x,
                  width: link.getBoundingClientRect().width,
                })),
                legalRows: new Set(
                  legal.map((link) => Math.round(link.getBoundingClientRect().top)),
                ).size,
                overflow: document.documentElement.scrollWidth > innerWidth,
              };
            }),
          );
          if (route === '/pricing')
            await footer.screenshot({ path: testInfo.outputPath('pricing-footer.png') });
        }
        for (const sample of samples) {
          expect(sample).toEqual(samples[0]);
          expect(sample.overflow).toBe(false);
        }
      });
    }
  }
});
