import { expect, test, type Locator, type Page } from '@playwright/test';

import { INSPIRATION, inspirationPath, type InspirationCard } from '../app/gallery/inspiration';

const VIEWPORTS = [
  { width: 1180, height: 757 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const MIN_COLUMN_SHARE = 0.9;
const EDGE_TOLERANCE_PX = 1;
const HYDRATION_RETRY_MS = 2_000;
const FRAMED_TYPES: ReadonlyArray<InspirationCard['type']> = ['html', 'react', 'svg'];
const SOURCE_ONLY = INSPIRATION.filter((template) => template.type === 'code');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(target: Locator, what: string): Promise<Box> {
  await expect(target, what).toBeVisible();
  const box = await target.boundingBox();
  expect(box, what).not.toBeNull();
  return box!;
}

function viewer(page: Page): Locator {
  return page.getByTestId('artifact-preview-card');
}

function sourceRegion(scope: Page | Locator): Locator {
  return scope.getByRole('region', { name: 'Artifact source' });
}

function previewSurface(card: Locator, template: InspirationCard): Locator {
  if (template.type === 'mermaid') return card.getByTestId('artifact-mermaid-preview');
  if (FRAMED_TYPES.includes(template.type)) return card.getByTitle(template.title, { exact: true });
  return card.getByRole('tabpanel');
}

async function contentColumn(page: Page, template: InspirationCard) {
  const main = await boxOf(page.getByRole('main'), 'main landmark');
  const heading = await boxOf(
    page.getByRole('heading', { level: 1, name: template.title }),
    'example heading',
  );
  const inset = heading.x - main.x;
  return { left: heading.x, right: main.x + main.width - inset, width: main.width - 2 * inset };
}

async function selectTab(card: Locator, name: 'Preview' | 'Code') {
  const tab = card.getByRole('tab', { name });
  await expect(async () => {
    await tab.click({ timeout: HYDRATION_RETRY_MS });
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: HYDRATION_RETRY_MS });
  }).toPass();
}

function expectInside(inner: Box, outer: Box, what: string) {
  expect(inner.width, what).toBeGreaterThan(0);
  expect(inner.height, what).toBeGreaterThan(0);
  expect(inner.x, what).toBeGreaterThanOrEqual(outer.x - EDGE_TOLERANCE_PX);
  expect(inner.y, what).toBeGreaterThanOrEqual(outer.y - EDGE_TOLERANCE_PX);
  expect(inner.x + inner.width, what).toBeLessThanOrEqual(
    outer.x + outer.width + EDGE_TOLERANCE_PX,
  );
  expect(inner.y + inner.height, what).toBeLessThanOrEqual(
    outer.y + outer.height + EDGE_TOLERANCE_PX,
  );
}

test('the registry holds source-only and previewable examples', () => {
  expect(SOURCE_ONLY.length).toBeGreaterThan(0);
  expect(INSPIRATION.length).toBeGreaterThan(SOURCE_ONLY.length);
});

for (const viewport of VIEWPORTS) {
  test.describe(`gallery example viewer at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const template of INSPIRATION) {
      test(`${template.id} fills its column and shows its content and controls`, async ({
        page,
      }) => {
        const response = await page.goto(inspirationPath(template.id));
        expect(response?.status()).toBe(200);

        const card = viewer(page);
        const column = await contentColumn(page, template);
        const cardBox = await boxOf(card, 'artifact viewer');

        expect(cardBox.width).toBeGreaterThanOrEqual(column.width * MIN_COLUMN_SHARE);
        expect(cardBox.x).toBeGreaterThanOrEqual(column.left - EDGE_TOLERANCE_PX);
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(column.right + EDGE_TOLERANCE_PX);

        for (const control of ['Copy artifact', 'Download artifact']) {
          const controlBox = await boxOf(card.getByRole('button', { name: control }), control);
          expectInside(controlBox, cardBox, control);
        }

        if (template.type === 'code') {
          await expect(card.getByRole('tablist')).toHaveCount(0);
          await expect(sourceRegion(card)).toBeVisible();
          await expect(sourceRegion(card)).toHaveText(template.content);
        } else {
          await expect(card.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
            'aria-selected',
            'true',
          );
          await expect(previewSurface(card, template)).toBeVisible();

          await selectTab(card, 'Code');
          await expect(sourceRegion(card)).toHaveText(template.content);
          const codeBox = await boxOf(card, 'artifact viewer on Code');
          expect(codeBox.width).toBeCloseTo(cardBox.width, 0);

          await selectTab(card, 'Preview');
          await expect(previewSurface(card, template)).toBeVisible();
          const previewBox = await boxOf(card, 'artifact viewer back on Preview');
          expect(previewBox.width).toBeCloseTo(cardBox.width, 0);
        }

        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(horizontalOverflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe('gallery example source without scripts', () => {
  test.use({ javaScriptEnabled: false });

  for (const template of SOURCE_ONLY) {
    test(`${template.id} carries its full source in the server response`, async ({ page }) => {
      const response = await page.goto(inspirationPath(template.id));
      expect(response?.status()).toBe(200);

      await expect(
        page.getByRole('region', { name: 'Artifact source', includeHidden: true }),
      ).toHaveText(template.content);
    });
  }
});

test.describe('gallery listing drawer', () => {
  for (const template of SOURCE_ONLY) {
    test(`opening ${template.id} from the listing shows its source`, async ({ page }) => {
      const response = await page.goto('/gallery');
      expect(response?.status()).toBe(200);

      const examples = page.getByRole('button', { name: 'Inspiration', exact: true });
      const card = page.getByRole('button', { name: template.title });
      const drawer = page.getByRole('dialog', { name: template.title });
      await expect(async () => {
        if (!(await card.isVisible())) await examples.click({ timeout: HYDRATION_RETRY_MS });
        await expect(card).toBeVisible({ timeout: HYDRATION_RETRY_MS });
      }).toPass();
      await expect(async () => {
        if (!(await drawer.isVisible())) await card.click({ timeout: HYDRATION_RETRY_MS });
        await expect(drawer).toBeVisible({ timeout: HYDRATION_RETRY_MS });
      }).toPass();

      await expect(sourceRegion(drawer)).toBeVisible();
      await expect(sourceRegion(drawer)).toHaveText(template.content);
    });
  }
});
