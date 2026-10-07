import { test, expect, type Page } from '@playwright/test';
const ROUTES = ['/security'];
const HEADER = 'main > section.agi-ds-pagehead';
const LABEL_MIN_PX = 14;
const LEDE_MIN_PX = 17;
const LEDE_MAX_PX = 19;
const TITLE_MIN_WEIGHT = 600;
const CONTAINER_GAP_TOLERANCE_PX = 1;

const VIEWPORTS = [
  {
    name: '1180x757',
    width: 1180,
    height: 757,
    title: { min: 32, max: 48 },
    header: { top: 80, bottom: 48 },
    section: 80,
  },
  {
    name: '390x844',
    width: 390,
    height: 844,
    title: { min: 28, max: 36 },
    header: { top: 48, bottom: 32 },
    section: 56,
  },
] as const;

function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

async function openRoute(page: Page, route: string): Promise<void> {
  const response = await page.goto(route, { waitUntil: 'load' });
  expect(response?.status(), `${route} must be served`).toBe(200);
  expect(new URL(page.url()).pathname).toBe(route);
  await expect(page.locator(HEADER)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function measure(page: Page) {
  return page.evaluate((selector) => {
    const px = (value: string) => Number.parseFloat(value);
    const header = document.querySelector<HTMLElement>(selector);
    if (!header) throw new Error('page header is missing');
    const next = header.nextElementSibling as HTMLElement | null;
    const root = header.closest<HTMLElement>('[data-design="agi"]');
    if (!root || !next) throw new Error('page header has no design root or following section');
    const rootStyle = getComputedStyle(root);
    const title = header.querySelector<HTMLElement>('h1');
    const label = header.querySelector<HTMLElement>('.agi-ds-pagehead-label');
    const lede = header.querySelector<HTMLElement>('.agi-ds-pagehead-lede');
    const headerContainer = header.querySelector<HTMLElement>('.agi-ds-container');
    const nextContainer = next.querySelector<HTMLElement>('.agi-ds-container');
    if (!title || !label || !lede || !headerContainer || !nextContainer) {
      throw new Error('page header is missing its title, label, lede or container');
    }
    const headerStyle = getComputedStyle(header);
    const titleStyle = getComputedStyle(title);
    const nextStyle = getComputedStyle(next);
    const nextContainerStyle = getComputedStyle(nextContainer);
    const textElements = Array.from(header.querySelectorAll<HTMLElement>('*')).filter((element) =>
      Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0,
      ),
    );
    return {
      sans: rootStyle.getPropertyValue('--agi-font'),
      serif: rootStyle.getPropertyValue('--agi-font-display'),
      mono: rootStyle.getPropertyValue('--agi-font-mono'),
      title: {
        family: titleStyle.fontFamily,
        size: px(titleStyle.fontSize),
        style: titleStyle.fontStyle,
        weight: Number(titleStyle.fontWeight),
        left: title.getBoundingClientRect().left,
      },
      label: { size: px(getComputedStyle(label).fontSize) },
      lede: { size: px(getComputedStyle(lede).fontSize) },
      header: { top: px(headerStyle.paddingTop), bottom: px(headerStyle.paddingBottom) },
      next: { top: px(nextStyle.paddingTop), bottom: px(nextStyle.paddingBottom) },
      containerLeft: {
        header: headerContainer.getBoundingClientRect().left,
        next: nextContainer.getBoundingClientRect().left,
      },
      nextContentLeft:
        nextContainer.getBoundingClientRect().left + px(nextContainerStyle.paddingLeft),
      texts: textElements.map((element) => {
        const style = getComputedStyle(element);
        return {
          text: (element.textContent ?? '').trim().slice(0, 40),
          size: px(style.fontSize),
          family: style.fontFamily,
          style: style.fontStyle,
          transform: style.textTransform,
        };
      }),
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }, HEADER);
}

for (const viewport of VIEWPORTS) {
  test.describe(`public page header at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('/about keeps its label and accessible title without promotional copy', async ({
      page,
    }) => {
      await openRoute(page, '/about');
      const header = page.locator(HEADER);
      await expect(header.locator('.agi-ds-pagehead-label')).toHaveText('About AGI');
      await expect(header.getByRole('heading', { level: 1 })).toHaveClass('sr-only');
      await expect(header.locator('.agi-ds-pagehead-lede')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });

    for (const route of ROUTES) {
      test(`${route} sets a compact sans title block on the section grid`, async ({ page }) => {
        await openRoute(page, route);
        const measured = await measure(page);

        const sans = firstFamily(measured.sans);
        const serif = firstFamily(measured.serif);
        const mono = firstFamily(measured.mono);
        expect(sans).not.toBe('');
        expect(firstFamily(measured.title.family)).toBe(sans);
        expect(firstFamily(measured.title.family)).not.toBe(serif);
        expect(measured.title.style).toBe('normal');
        expect(measured.title.weight).toBeGreaterThanOrEqual(TITLE_MIN_WEIGHT);
        expect(measured.title.size).toBeGreaterThanOrEqual(viewport.title.min);
        expect(measured.title.size).toBeLessThanOrEqual(viewport.title.max);

        expect(measured.label.size).toBeGreaterThanOrEqual(LABEL_MIN_PX);
        expect(measured.lede.size).toBeGreaterThanOrEqual(LEDE_MIN_PX);
        expect(measured.lede.size).toBeLessThanOrEqual(LEDE_MAX_PX);

        for (const text of measured.texts) {
          expect(text.size, `${text.text} is under ${LABEL_MIN_PX}px`).toBeGreaterThanOrEqual(
            LABEL_MIN_PX,
          );
          expect(text.style, `${text.text} is italic`).toBe('normal');
          expect(text.transform, `${text.text} is transformed`).toBe('none');
          expect(firstFamily(text.family), `${text.text} is serif`).not.toBe(serif);
          expect(firstFamily(text.family), `${text.text} is monospace`).not.toBe(mono);
        }

        expect(measured.header.top).toBeLessThanOrEqual(viewport.header.top);
        expect(measured.header.bottom).toBeLessThanOrEqual(viewport.header.bottom);
        expect(measured.next.top).toBeLessThanOrEqual(viewport.section);
        expect(measured.next.bottom).toBeLessThanOrEqual(viewport.section);

        expect(Math.abs(measured.containerLeft.header - measured.containerLeft.next)).toBeLessThan(
          CONTAINER_GAP_TOLERANCE_PX,
        );
        expect(Math.abs(measured.title.left - measured.nextContentLeft)).toBeLessThan(
          CONTAINER_GAP_TOLERANCE_PX,
        );
        expect(measured.horizontalScroll).toBe(false);
      });
    }
  });
}
