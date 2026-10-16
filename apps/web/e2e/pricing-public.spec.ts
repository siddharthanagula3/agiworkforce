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
    test(`the selected Annual label meets the public small-text standard in ${theme} mode`, async ({
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

      await expect(
        page
          .locator('article')
          .filter({ has: page.locator('#pricing-team-title') })
          .getByText(/^save \d+% annually$/i),
      ).toBeVisible();

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

          const fill = parse(getComputedStyle(button).backgroundColor);
          const text = parse(getComputedStyle(button).color);
          const a = luminance(text);
          const b = luminance(fill);
          return {
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            fillAlpha: fill.a,
            fontSize: getComputedStyle(button).fontSize,
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

const SEAT_ROW_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
] as const;

test.describe('/pricing Team card prices each seat type in its own row', () => {
  for (const viewport of SEAT_ROW_VIEWPORTS) {
    test(`Standard and Premium seats follow the billing toggle at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await mockAuthProvider(page);
      await page.route('**/api/pricing/localized', (route) =>
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOCALIZED_PRICING) }),
      );
      const response = await page.goto('/pricing#pricing-team-title');
      expect(response?.status()).toBe(200);

      const card = page.locator('article').filter({ has: page.locator('#pricing-team-title') });
      const seatRow = (name: string) =>
        card.locator('.agi-tier-seat-row').filter({ has: page.getByRole('heading', { name }) });
      const standard = seatRow('Standard seat');
      const premium = seatRow('Premium seat');

      await expect(card.locator('.agi-tier-seat-row')).toHaveCount(2);
      await expect(standard.locator('.agi-tier-seat-price')).toHaveText('$20 per seat / month');
      await expect(standard).toContainText('$25 per seat / month when billed monthly');
      await expect(premium.locator('.agi-tier-seat-price')).toHaveText('$100 per seat / month');
      await expect(premium).toContainText('$125 per seat / month when billed monthly');
      await expect(premium).toContainText('5x the usage of a Standard seat');
      await expect(card).toContainText('Mix both seat types in one team');
      expect(await pageOverflow(page)).toBe(0);

      await card.getByRole('button', { name: /^Monthly/ }).click();
      await expect(standard.locator('.agi-tier-seat-price')).toHaveText('$25 per seat / month');
      await expect(standard).toContainText('$20 per seat / month when billed yearly');
      await expect(premium.locator('.agi-tier-seat-price')).toHaveText('$125 per seat / month');
      await expect(card.getByRole('spinbutton', { name: 'Seats', exact: true })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Get Team' })).toBeVisible();
      expect(await pageOverflow(page)).toBe(0);
    });
  }
});

const TABLE_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1100, height: 757 },
] as const;

const SCROLL_BOX_VIEWPORTS = [
  { width: 1099, height: 757 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
] as const;

const CARD_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
] as const;

const COMPARED_PLANS = ['Free', 'Basic', 'Pro', 'Max 5x', 'Max 20x', 'Team'];
const CARD_PLANS = ['Free', 'Basic', 'Pro', 'Max 5x', 'Max 20x'];
const COMPARISON_GROUPS = [
  'Usage',
  'Models',
  'Research and creation',
  'Projects and files',
  'Tools and automation',
  'Admin and data',
];
const RUNNING_TEXT_MIN = 17;

async function openPricing(page: Page, hash = '') {
  await mockAuthProvider(page);
  await page.route('**/api/pricing/localized', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOCALIZED_PRICING) }),
  );
  const response = await page.goto(`/pricing${hash}`);
  expect(response?.status()).toBe(200);
}

async function openPricingComparison(page: Page) {
  await openPricing(page, '#pricing-compare-title');
  const section = page.locator('section[aria-labelledby="pricing-compare-title"]');
  await expect(section.getByRole('heading', { name: 'Compare plans' })).toBeVisible();
  return {
    section,
    box: section.getByRole('region', { name: 'Compare plans' }),
    table: section.getByRole('table', { name: 'Compare plans' }),
  };
}

function pageOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function expectOnlyTheScrollBox(section: Locator) {
  await expect(section.locator('details')).toHaveCount(0);
  await expect(section.getByRole('button')).toHaveCount(0);
  await expect(section.locator('select')).toHaveCount(0);
  await expect(section.locator('[role="region"]')).toHaveCount(1);
  await expect(section.getByText(/scroll sideways/i)).toHaveCount(0);
}

test.describe('/pricing shows five plan cards, then Team', () => {
  for (const viewport of CARD_VIEWPORTS) {
    test(`cards, band and running text at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openPricing(page);

      const cards = page.locator('.agi-tier-grid--plans > article');
      await expect(cards.locator('.agi-tier-name')).toHaveText(CARD_PLANS);
      await expect(page.locator('.agi-tier-badge, .agi-tier--featured')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Billing audience' })).toHaveCount(0);
      await expect(cards.nth(3).getByRole('button', { name: 'Get Max 5x' })).toBeVisible();
      await expect(cards.nth(4).getByRole('button', { name: 'Get Max 20x' })).toBeVisible();
      await expect(
        page.locator('article').filter({ has: page.locator('#pricing-team-title') }),
      ).toContainText('Everything in Pro, plus:');

      const fills = await cards
        .locator('.agi-tier-cta-group > .agi-tier-cta')
        .evaluateAll((buttons) =>
          buttons.map((button) => getComputedStyle(button).backgroundColor),
        );
      expect(fills).toHaveLength(CARD_PLANS.length);
      expect(new Set(fills).size).toBe(1);

      const smallest = await page
        .locator('.agi-tier-features li, .agi-tier-body')
        .evaluateAll((nodes) =>
          Math.min(...nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize))),
        );
      expect(smallest).toBeGreaterThanOrEqual(RUNNING_TEXT_MIN);
      expect(await pageOverflow(page)).toBe(0);

      if (viewport.width >= 1280) {
        for (const card of await cards.all()) {
          await expect(card.locator('.agi-tier-cta-group > .agi-tier-cta')).toBeInViewport();
        }
      }
    });
  }
});

test.describe('/pricing comparison scrolls inside one box under 1100px', () => {
  for (const viewport of SCROLL_BOX_VIEWPORTS) {
    test(`plan labels and row labels stay in view inside the box at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const { section, box, table } = await openPricingComparison(page);

      await expect(box).toBeVisible();
      await expect(table).toBeVisible();
      await expectOnlyTheScrollBox(section);
      await expect(table.locator('thead th .agi-compare-plan-name')).toHaveText(COMPARED_PLANS);
      await expect(table.locator('tr.agi-compare-group th')).toHaveText(COMPARISON_GROUPS);
      expect(await pageOverflow(page)).toBe(0);

      const geometry = await box.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.scrollLeft = element.scrollWidth;
        const bounds = element.getBoundingClientRect();
        const header = element.querySelector('thead th');
        const rowLabel = element.querySelector('tbody tr:last-child th[scope="row"]');
        if (!header || !rowLabel) throw new Error('comparison table is missing');
        const headerBounds = header.getBoundingClientRect();
        const labelBounds = rowLabel.getBoundingClientRect();
        return {
          scrollsSideways: element.scrollWidth > element.clientWidth,
          boxTop: bounds.top,
          boxLeft: bounds.left,
          boxRight: bounds.right,
          headerTop: headerBounds.top,
          labelLeft: labelBounds.left,
          viewport: document.documentElement.clientWidth,
        };
      });
      expect(geometry.boxRight).toBeLessThanOrEqual(geometry.viewport);
      if (viewport.width < 1000) expect(geometry.scrollsSideways).toBe(true);
      expect(Math.abs(geometry.headerTop - geometry.boxTop)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry.labelLeft - geometry.boxLeft)).toBeLessThanOrEqual(2);

      await box.focus();
      await expect(box).toBeFocused();
      expect(await pageOverflow(page)).toBe(0);
    });
  }
});

test.describe('/pricing comparison is one table from 1100px', () => {
  for (const viewport of TABLE_VIEWPORTS) {
    test(`plans run across the top with no sideways scroll at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { section, table } = await openPricingComparison(page);

      await expect(table).toBeVisible();
      await expect(page.locator('table')).toHaveCount(1);
      await expectOnlyTheScrollBox(section);

      const planNames = table.locator('thead th .agi-compare-plan-name');
      await expect(planNames).toHaveText(COMPARED_PLANS);
      for (const header of await table.locator('thead th').all()) {
        await expect(header.locator('.agi-compare-plan-price').first()).toContainText(/\/\s?month/);
      }
      await expect(table.locator('tr.agi-compare-group th')).toHaveText(COMPARISON_GROUPS);
      await expect(table.locator('tbody th[scope="row"]').first()).toContainText(
        'Managed Cloud chat',
      );

      const fits = () =>
        table.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const scrollers: string[] = [];
          for (let node = element.parentElement; node; node = node.parentElement) {
            const overflowX = getComputedStyle(node).overflowX;
            const userScrollable = overflowX === 'auto' || overflowX === 'scroll';
            if (userScrollable && node.scrollWidth > node.clientWidth) {
              scrollers.push(node.className || node.tagName);
            }
          }
          return {
            left: bounds.left,
            right: bounds.right,
            viewport: document.documentElement.clientWidth,
            scrollers,
          };
        });
      const yearly = await fits();
      expect(yearly.left).toBeGreaterThanOrEqual(0);
      expect(yearly.right).toBeLessThanOrEqual(yearly.viewport);
      expect(yearly.scrollers).toEqual([]);
      expect(await pageOverflow(page)).toBe(0);

      const team = table.locator('thead th').last();
      await expect(team).toContainText('$20 per seat / month');
      await expect(team).toContainText('billed yearly');
      await page
        .locator('article')
        .filter({ has: page.locator('#pricing-team-title') })
        .getByRole('button', { name: /^Monthly/ })
        .click();
      await expect(team).toContainText('$25 per seat / month');
      await expect(team).toContainText('billed monthly');

      const monthly = await fits();
      expect(monthly.right).toBeLessThanOrEqual(monthly.viewport);
      expect(monthly.scrollers).toEqual([]);
      expect(await pageOverflow(page)).toBe(0);
    });

    test(`plan names stay pinned under the site header while rows scroll at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { table } = await openPricingComparison(page);
      await expect(table).toBeVisible();

      const lastRow = table.locator('tbody tr').last();
      await lastRow.evaluate((row) => row.scrollIntoView({ block: 'center' }));
      await expect(page.locator('.agi-ds-header')).toHaveAttribute('data-scrolled', 'true');

      const pinned = await table.evaluate((element) => {
        const siteHeader = document.querySelector('.agi-ds-header-surface');
        const headers = [...element.querySelectorAll('thead th')];
        const rows = element.querySelectorAll('tbody tr');
        const last = rows[rows.length - 1];
        if (!siteHeader || headers.length === 0 || !last) {
          throw new Error('comparison table or site header is missing');
        }
        return {
          siteHeaderBottom: siteHeader.getBoundingClientRect().bottom,
          lastRowTop: last.getBoundingClientRect().top,
          tableTop: element.getBoundingClientRect().top,
          headers: headers.map((header) => {
            const bounds = header.getBoundingClientRect();
            const hit = document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            );
            return {
              top: bounds.top,
              bottom: bounds.bottom,
              position: getComputedStyle(header).position,
              onTop: hit !== null && header.contains(hit),
            };
          }),
        };
      });

      expect(pinned.tableTop).toBeLessThan(0);
      for (const header of pinned.headers) {
        expect(header.position).toBe('sticky');
        expect(Math.abs(header.top - pinned.siteHeaderBottom)).toBeLessThanOrEqual(1);
        expect(header.onTop).toBe(true);
        expect(pinned.lastRowTop).toBeGreaterThanOrEqual(header.bottom);
      }
      await expect(table.locator('thead th').last()).toBeInViewport();
      await expect(lastRow).toBeInViewport();
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`pinned plan cells are opaque and every comparison text clears AA in ${theme} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1180, height: 757 });
      await page.emulateMedia({ colorScheme: theme });
      const { table } = await openPricingComparison(page);
      await expect(table).toBeVisible();

      const measured = await table.evaluate((element) => {
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
        const backdrop = (node: Element) => {
          for (let current: Element | null = node; current; current = current.parentElement) {
            const fill = getComputedStyle(current).backgroundColor;
            if (parse(fill).a === 1) return fill;
          }
          return getComputedStyle(document.documentElement).backgroundColor;
        };
        const texts = [
          ...element.querySelectorAll(
            [
              '.agi-compare-plan-name',
              '.agi-compare-plan-price',
              '.agi-compare-group th',
              '.agi-compare-row-label',
              '.agi-compare-row-note',
              '.agi-compare-value--text',
              '.agi-compare-value--excluded',
              '.agi-compare-value--included svg',
            ].join(', '),
          ),
        ];
        return {
          pinned: [...element.querySelectorAll('thead th, thead td')].map((cell) => ({
            position: getComputedStyle(cell).position,
            fillAlpha: parse(getComputedStyle(cell).backgroundColor).a,
          })),
          texts: texts.map((node) => {
            const style = getComputedStyle(node);
            const fill = parse(backdrop(node));
            const a = luminance(parse(style.color));
            const b = luminance(fill);
            return {
              text: `${node.getAttribute('class') ?? node.tagName}: ${node.textContent?.trim() ?? ''}`,
              fontSize: Number.parseFloat(style.fontSize),
              fillAlpha: fill.a,
              ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            };
          }),
        };
      });

      expect(measured.pinned.length).toBeGreaterThan(1);
      for (const cell of measured.pinned) {
        expect(cell.position).toBe('sticky');
        expect(cell.fillAlpha).toBe(1);
      }
      expect(measured.texts.length).toBeGreaterThan(50);
      for (const node of measured.texts) {
        expect(node.fillAlpha, node.text).toBe(1);
        expect(node.ratio, node.text).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        if (!node.text.includes('svg')) {
          expect(node.fontSize, node.text).toBeGreaterThanOrEqual(14);
        }
      }
    });
  }
});
