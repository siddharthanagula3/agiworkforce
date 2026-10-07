import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockAuthProvider } from './lib/mock-auth-provider';

const WCAG_AA_NORMAL = 4.5;
const PUBLIC_SMALL_TEXT_CONTRAST = 7;

const LOCALIZED_PRICING = {
  country: 'US',
  requestedCurrency: 'usd',
  plans: {
    basic: {},
    pro: {},
    max: {},
    max_15x: {},
    team: {
      monthly: { amountMinor: 2_500, currency: 'usd', localized: false, checkoutReady: true },
      yearly: { amountMinor: 24_000, currency: 'usd', localized: false, checkoutReady: true },
    },
  },
};

test.describe('/pricing Team billing toggle', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the selected Annual savings label meets the public small-text standard in ${theme} mode`, async ({
      page,
    }) => {
      await mockAuthProvider(page);
      await page.route('**/api/pricing/localized', (route) =>
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOCALIZED_PRICING) }),
      );
      await page.emulateMedia({ colorScheme: theme });

      const response = await page.goto('/pricing#pricing-team-title');
      expect(response?.status()).toBe(200);

      const annual = page.getByRole('button', { name: /^Annual/ });
      await expect(annual).toBeVisible();
      await expect(annual).toHaveAttribute('aria-pressed', 'true');

      const save = annual.locator('.agi-tier-toggle-save');
      await expect(save).toBeVisible();

      const measure = () =>
        annual.evaluate((button) => {
          const parse = (value: string) => {
            const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
            const scale = value.startsWith('color(') ? 255 : 1;
            return {
              r: (parts[0] ?? 0) * scale,
              g: (parts[1] ?? 0) * scale,
              b: (parts[2] ?? 0) * scale,
              a: parts[3] ?? 1,
            };
          };
          const channel = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          const luminance = (c: { r: number; g: number; b: number }) =>
            0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

          const label = button.querySelector('.agi-tier-toggle-save');
          if (!label) return null;
          const fill = parse(getComputedStyle(button).backgroundColor);
          const text = parse(getComputedStyle(label).color);
          const a = luminance(text);
          const b = luminance(fill);
          return {
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            fillAlpha: fill.a,
            fontSize: getComputedStyle(label).fontSize,
          };
        });

      const resting = await measure();
      expect(resting).not.toBeNull();
      expect(resting?.fillAlpha).toBe(1);
      expect(resting?.fontSize).toBe('14px');
      expect(resting?.ratio).toBeGreaterThanOrEqual(PUBLIC_SMALL_TEXT_CONTRAST);

      await annual.hover();
      await expect
        .poll(async () => {
          const m = await measure();
          return m && m.fillAlpha === 1 ? m.ratio : 0;
        })
        .toBeGreaterThanOrEqual(PUBLIC_SMALL_TEXT_CONTRAST);

      await page.mouse.move(0, 0);
      await page.getByRole('button', { name: /^Monthly/ }).focus();
      await page.keyboard.press('Tab');
      await expect(annual).toBeFocused();
      await expect
        .poll(async () => {
          const m = await measure();
          return m && m.fillAlpha === 1 ? m.ratio : 0;
        })
        .toBeGreaterThanOrEqual(PUBLIC_SMALL_TEXT_CONTRAST);
    });
  }
});

const COMPARISON_VIEWPORTS = [
  { width: 1180, height: 757 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;

type RegionGeometry = {
  regionLeft: number;
  regionTop: number;
  lastRowHeaderLeft: number;
  headerTop: number;
  scrollLeft: number;
  scrollTop: number;
  pageOverflow: number;
};

async function openPricingComparison(page: Page) {
  await mockAuthProvider(page);
  await page.route('**/api/pricing/localized', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOCALIZED_PRICING) }),
  );
  const response = await page.goto('/pricing#pricing-compare-title');
  expect(response?.status()).toBe(200);
}

async function openComparison(page: Page) {
  await openPricingComparison(page);
  const reveal = page.getByRole('button', { name: 'Show the full table' });
  if (await reveal.isVisible()) await reveal.click();
  const region = page.getByRole('region', { name: 'Scrollable plan comparison' });
  await expect(region).toBeVisible();
  await region.scrollIntoViewIfNeeded();
  return region;
}

function pageOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('/pricing comparison shows one plan at a time on narrow screens', () => {
  for (const viewport of COMPARISON_VIEWPORTS.filter((v) => v.width < 760)) {
    test(`the stack is the only view at ${viewport.width}x${viewport.height} until the table is opted in`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openPricingComparison(page);

      const select = page.getByRole('combobox', { name: 'Plan' });
      const table = page.getByRole('table', { name: 'Plan capabilities' });
      const toggle = page.getByRole('button', { name: 'Show the full table' });
      await expect(select).toBeVisible();
      await expect(table).toBeHidden();
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(await pageOverflow(page)).toBe(0);

      const selectBox = await select.boundingBox();
      expect(selectBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      const toggleBox = await toggle.boundingBox();
      expect(toggleBox?.height ?? 0).toBeGreaterThanOrEqual(44);

      const firstPlan = await select.inputValue();
      const list = page.locator('.agi-compare-stack-list');
      const terms = list.locator('dt');
      await expect(terms.first()).toHaveText('Price');
      expect(await terms.count()).toBeGreaterThan(10);
      const firstValues = await list.locator('dd').allTextContents();
      expect(firstValues).toHaveLength(await terms.count());

      await select.focus();
      await expect(select).toBeFocused();
      await page.keyboard.press('t');
      await expect.poll(() => select.inputValue()).not.toBe(firstPlan);
      const secondPlan = await select.inputValue();
      const secondLabel = await select.locator(`option[value="${secondPlan}"]`).textContent();
      await expect(list).toHaveAttribute('aria-label', secondLabel ?? '');
      expect(await list.locator('dd').allTextContents()).not.toEqual(firstValues);
      expect(await pageOverflow(page)).toBe(0);

      await toggle.click();
      await expect(page.getByRole('button', { name: 'Hide the full table' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(select).toBeHidden();
      await expect(table).toBeVisible();
      const region = page.getByRole('region', { name: 'Scrollable plan comparison' });
      await expect(region).toBeVisible();
      await expect(region.locator('tbody th[scope="row"]').first()).toHaveCSS('position', 'sticky');
      expect(await pageOverflow(page)).toBe(0);

      const summary = page.locator('#pricing-compare-table summary');
      await summary.focus();
      await summary.press('Enter');
      await expect(select).toBeVisible();
      await expect(table).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await toggle.press('Enter');
      await expect(table).toBeVisible();
      await expect(select).toBeHidden();

      const hide = page.getByRole('button', { name: 'Hide the full table' });
      await hide.click();
      await expect(select).toBeVisible();
      await expect(select).toHaveValue(secondPlan);
      await expect(table).toBeHidden();
      await expect(hide).toBeHidden();
      await expect(toggle).toBeFocused();
    });
  }

  test('only the table is exposed at 1180x757', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 757 });
    await openPricingComparison(page);

    await expect(page.getByRole('table', { name: 'Plan capabilities' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Plan' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Show the full table' })).toBeHidden();
    await expect(page.locator('.agi-compare-stack-list')).toBeHidden();
  });

  test('the desktop disclosure closes and reopens without moving focus', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 757 });
    await openPricingComparison(page);

    const summary = page.locator('#pricing-compare-table summary');
    const table = page.getByRole('table', { name: 'Plan capabilities' });
    await summary.focus();
    await summary.press('Enter');

    await expect(table).toBeHidden();
    await expect(summary).toBeFocused();

    await summary.press('Enter');

    await expect(table).toBeVisible();
    await expect(summary).toBeFocused();
  });
});

function regionGeometry(region: Locator): Promise<RegionGeometry> {
  return region.evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    const rows = el.querySelectorAll('tbody tr');
    const lastRowHeader = rows[rows.length - 1]?.querySelector('th[scope="row"]');
    const lastHeader = el.querySelector('thead th:last-child');
    if (!lastRowHeader || !lastHeader) throw new Error('comparison table is missing headers');
    return {
      regionLeft: bounds.left + el.clientLeft,
      regionTop: bounds.top + el.clientTop,
      lastRowHeaderLeft: lastRowHeader.getBoundingClientRect().left,
      headerTop: lastHeader.getBoundingClientRect().top,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test.describe('/pricing comparison keeps plan names and capability headers pinned', () => {
  for (const viewport of COMPARISON_VIEWPORTS) {
    test(`row headers and the header row stay visible at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const region = await openComparison(page);

      await region.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
        el.scrollTop = el.scrollHeight;
      });
      const geometry = await regionGeometry(region);
      expect(geometry.scrollLeft).toBeGreaterThan(0);
      expect(geometry.scrollTop).toBeGreaterThan(0);
      expect(Math.abs(geometry.lastRowHeaderLeft - geometry.regionLeft)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.headerTop - geometry.regionTop)).toBeLessThanOrEqual(1);
      expect(geometry.pageOverflow).toBe(0);

      await expect(region.locator('tbody tr:last-child th[scope="row"]')).toBeInViewport();
      await expect(region.locator('thead th:last-child')).toBeInViewport();
    });
  }

  test('the region scrolls with the keyboard once focused', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 757 });
    const region = await openComparison(page);
    await expect(region).toHaveAttribute('tabindex', '0');
    await region.focus();
    await expect(region).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`sticky plan cells are opaque and clear AA in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1180, height: 757 });
      await page.emulateMedia({ colorScheme: theme });
      const region = await openComparison(page);

      const measured = await region.evaluate((el) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const pen = canvas.getContext('2d', { willReadFrequently: true });
        if (!pen) throw new Error('canvas unavailable');
        pen.globalCompositeOperation = 'copy';
        const parse = (value: string) => {
          pen.fillStyle = 'rgba(0, 0, 0, 0)';
          pen.fillStyle = value;
          pen.fillRect(0, 0, 1, 1);
          const d = pen.getImageData(0, 0, 1, 1).data;
          return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: (d[3] ?? 0) / 255 };
        };
        const channel = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (c: { r: number; g: number; b: number }) =>
          0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
        const ratio = (fg: string, bg: string) => {
          const a = luminance(parse(fg));
          const b = luminance(parse(bg));
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const cells = [...el.querySelectorAll('tbody th[scope="row"], thead th')];
        return cells.map((cell) => {
          const style = getComputedStyle(cell);
          return {
            text: cell.textContent?.trim() ?? '',
            highlighted: cell.parentElement?.classList.contains('agi-compare-row--highlighted'),
            position: style.position,
            fillAlpha: parse(style.backgroundColor).a,
            ratio: ratio(style.color, style.backgroundColor),
          };
        });
      });

      expect(measured.length).toBeGreaterThan(1);
      const team = measured.find((cell) => cell.text === 'Team');
      expect(team?.highlighted).toBe(true);
      for (const cell of measured) {
        expect(cell.position, cell.text).toBe('sticky');
        expect(cell.fillAlpha, cell.text).toBe(1);
        expect(cell.ratio, cell.text).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      }
    });
  }
});
