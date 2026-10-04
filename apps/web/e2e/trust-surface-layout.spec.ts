import { expect, test, type Page } from '@playwright/test';

const DESKTOP = { width: 1180, height: 757 };
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const SUBPIXEL_TOLERANCE_PX = 1;

const THREE_FACT_SECTIONS = [
  { route: '/get-started', section: '#pick-mode' },
  { route: '/contact-sales', section: '#what-to-include' },
  { route: '/status', section: '#boundaries' },
];

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

async function open(page: Page, route: string): Promise<void> {
  const response = await page.goto(route);
  expect(response?.status(), route).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

async function factCards(page: Page, section: string): Promise<{ grid: Box; cards: Box[] }> {
  const cards = page.locator(`${section} .agi-ds-card`);
  await expect(cards, section).toHaveCount(3);
  await cards.first().scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);

  return page.evaluate((selector) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      };
    };
    const nodes = Array.from(document.querySelectorAll(`${selector} .agi-ds-card`));
    const parent = nodes[0]?.parentElement;
    if (!parent) throw new Error(`no fact cards under ${selector}`);
    return { grid: box(parent), cards: nodes.map(box) };
  }, section);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

test.describe('three-item fact grids at 1180 wide', () => {
  test.use({ viewport: DESKTOP });

  for (const { route, section } of THREE_FACT_SECTIONS) {
    test(`${route} lays its three cards on one row at equal widths`, async ({ page }) => {
      await open(page, route);
      const { grid, cards } = await factCards(page, section);

      expect(spread(cards.map((card) => card.width)), 'card widths').toBeLessThanOrEqual(
        SUBPIXEL_TOLERANCE_PX,
      );
      expect(spread(cards.map((card) => card.top)), 'card tops').toBeLessThanOrEqual(
        SUBPIXEL_TOLERANCE_PX,
      );
      expect(cards[1]!.left).toBeGreaterThan(cards[0]!.right);
      expect(cards[2]!.left).toBeGreaterThan(cards[1]!.right);
      expect(Math.abs(cards[0]!.left - grid.left)).toBeLessThanOrEqual(SUBPIXEL_TOLERANCE_PX);
      expect(Math.abs(cards[2]!.right - grid.right)).toBeLessThanOrEqual(SUBPIXEL_TOLERANCE_PX);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

for (const viewport of PHONES) {
  test.describe(`three-item fact grids at ${viewport.width} wide`, () => {
    test.use({ viewport });

    for (const { route, section } of THREE_FACT_SECTIONS) {
      test(`${route} stacks its three cards with no horizontal scroll`, async ({ page }) => {
        await open(page, route);
        const { grid, cards } = await factCards(page, section);

        expect(spread(cards.map((card) => card.width)), 'card widths').toBeLessThanOrEqual(
          SUBPIXEL_TOLERANCE_PX,
        );
        expect(spread(cards.map((card) => card.left)), 'card left edges').toBeLessThanOrEqual(
          SUBPIXEL_TOLERANCE_PX,
        );
        expect(cards[1]!.top).toBeGreaterThanOrEqual(cards[0]!.bottom);
        expect(cards[2]!.top).toBeGreaterThanOrEqual(cards[1]!.bottom);
        expect(Math.abs(cards[0]!.width - grid.width)).toBeLessThanOrEqual(SUBPIXEL_TOLERANCE_PX);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  });
}
