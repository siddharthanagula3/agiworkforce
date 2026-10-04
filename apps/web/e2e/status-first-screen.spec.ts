import { expect, test, type Locator, type Page } from '@playwright/test';

const DESKTOP = { width: 1180, height: 757 };
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const SUBPIXEL_TOLERANCE_PX = 1;
const UNAVAILABLE = 'Checks unavailable';
const STATE_SENTENCES = [
  'Checks passing',
  'Some checks failing',
  'Core check failing',
  'Stale result',
  UNAVAILABLE,
];

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface FirstScreen {
  title: Locator;
  summary: Locator;
  state: Locator;
  lastCheck: Locator;
  report: Locator;
  rows: Locator;
  method: Locator;
}

async function open(page: Page): Promise<FirstScreen> {
  const response = await page.goto('/status');
  expect(response?.status()).toBe(200);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const summary = page.getByRole('region', { name: 'Current status' });
  return {
    title: page.getByRole('heading', { level: 1, name: 'Service status' }),
    summary,
    state: summary.getByRole('heading', { level: 2 }),
    lastCheck: summary.getByText(/^Last successful check:/),
    report: summary.getByRole('link', { name: 'Report a problem' }),
    rows: page.getByRole('list', { name: 'Live signal' }).getByRole('listitem'),
    method: page.getByRole('heading', { level: 2, name: /How these checks work/ }),
  };
}

async function box(locator: Locator, name: string): Promise<Box> {
  const bounds = await locator.boundingBox();
  expect(bounds, `${name} is not rendered`).not.toBeNull();
  return {
    top: bounds!.y,
    bottom: bounds!.y + bounds!.height,
    left: bounds!.x,
    right: bounds!.x + bounds!.width,
  };
}

async function expectedRowCount(first: FirstScreen): Promise<number> {
  const sentence = (await first.state.textContent()) ?? '';
  expect(STATE_SENTENCES).toContain(sentence);

  const count = await first.rows.count();
  if (sentence === UNAVAILABLE) {
    expect(count, 'an unavailable result lists no checks').toBe(0);
  } else {
    expect(count, 'a result lists its checks').toBeGreaterThan(0);
  }
  return count;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function signalGeometry(page: Page): Promise<{ boxes: number[][]; animated: string[] }> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#signal *'));
    return {
      boxes: nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value));
      }),
      animated: nodes
        .filter((node) => getComputedStyle(node).animationName !== 'none')
        .map((node) => `${node.tagName.toLowerCase()}.${node.className}`),
    };
  });
}

async function transitioning(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#signal *:not(a)'))
      .filter((node) =>
        getComputedStyle(node)
          .transitionDuration.split(',')
          .some((duration) => Number.parseFloat(duration) > 0),
      )
      .map((node) => `${node.tagName.toLowerCase()}.${node.className}`),
  );
}

test.describe('/status first screen at 1180 by 757', () => {
  test.use({ viewport: DESKTOP });

  test('shows the title, the state, the last check and the first check without scrolling', async ({
    page,
  }) => {
    const first = await open(page);
    const rowCount = await expectedRowCount(first);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const parts: [string, Locator][] = [
      ['title', first.title],
      ['state sentence', first.state],
      ['last check line', first.lastCheck],
    ];
    if (rowCount > 0) parts.push(['first check row', first.rows.first()]);

    let previousBottom = 0;
    for (const [name, locator] of parts) {
      const bounds = await box(locator, name);
      expect(bounds.top, `${name} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom, `${name} ends above the fold`).toBeLessThanOrEqual(DESKTOP.height);
      expect(bounds.top, `${name} follows what precedes it`).toBeGreaterThanOrEqual(
        previousBottom - SUBPIXEL_TOLERANCE_PX,
      );
      previousBottom = bounds.bottom;
    }

    await expect(first.lastCheck).toHaveText(
      /^Last successful check: (Not completed|.+ GMT \(.+ ago\))$/,
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('puts how the checks work below the list it explains', async ({ page }) => {
    const first = await open(page);
    const rowCount = await expectedRowCount(first);

    const lastOfResult =
      rowCount > 0
        ? await box(first.rows.last(), 'last check row')
        : await box(first.summary, 'summary');
    const method = await box(first.method, 'method heading');

    expect(method.top).toBeGreaterThanOrEqual(lastOfResult.bottom);
  });

  test('renders the same result with reduced motion, because nothing in it moves', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);
    const moving = await signalGeometry(page);
    expect(moving.animated).toEqual([]);
    expect(await transitioning(page)).toEqual([]);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const still = await signalGeometry(page);

    expect(still.animated).toEqual([]);
    expect(still.boxes).toEqual(moving.boxes);
  });

  test('reaches the report link first when tabbing into the page body', async ({ page }) => {
    const first = await open(page);

    await page.locator('#main-content').evaluate((main: HTMLElement) => {
      main.setAttribute('tabindex', '-1');
      main.focus();
    });
    await page.keyboard.press('Tab');

    await expect(first.report).toBeFocused();
    await expect(first.report).toHaveAttribute('href', /^mailto:/);
  });
});

for (const viewport of PHONES) {
  test.describe(`/status at ${viewport.width} wide`, () => {
    test.use({ viewport });

    test('stacks title, summary and checks in that order with no horizontal scroll', async ({
      page,
    }) => {
      const first = await open(page);
      const rowCount = await expectedRowCount(first);

      const title = await box(first.title, 'title');
      const summary = await box(first.summary, 'summary');
      const method = await box(first.method, 'method heading');

      expect(summary.top).toBeGreaterThanOrEqual(title.bottom);
      expect(summary.left).toBeGreaterThanOrEqual(0);
      expect(summary.right).toBeLessThanOrEqual(viewport.width + SUBPIXEL_TOLERANCE_PX);

      let resultBottom = summary.bottom;
      if (rowCount > 0) {
        const firstRow = await box(first.rows.first(), 'first check row');
        const lastRow = await box(first.rows.last(), 'last check row');
        expect(firstRow.top).toBeGreaterThanOrEqual(summary.bottom);
        expect(firstRow.right).toBeLessThanOrEqual(viewport.width + SUBPIXEL_TOLERANCE_PX);
        resultBottom = lastRow.bottom;
      }

      expect(method.top).toBeGreaterThanOrEqual(resultBottom);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
