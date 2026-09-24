import { test, expect } from '@playwright/test';
import { getModelReasoning } from '@agiworkforce/types';

import { signIn } from './qa-capability-harness';

test.describe('chat surface layout', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('the composer and the message column share one set of edges', async ({ page }) => {
    await page.goto('/chat');
    const composer = page.getByRole('textbox').first();
    await expect(composer).toBeVisible({ timeout: 20000 });

    const probe = 'Layout probe: do the message column and the composer line up?';
    await composer.fill(probe);
    await composer.press('Enter');
    await expect(page.locator('.message-inner').first()).toBeVisible({ timeout: 30000 });

    const edges = {
      composer: await composer.evaluate((el: HTMLElement) => {
        const column = el.closest('.max-w-3xl') as HTMLElement | null;
        return column
          ? {
              left: Math.round(column.getBoundingClientRect().left),
              right: Math.round(column.getBoundingClientRect().right),
            }
          : null;
      }),
      message: await page
        .locator('.message-inner')
        .first()
        .evaluate((el: HTMLElement) => ({
          left: Math.round(el.getBoundingClientRect().left),
          right: Math.round(el.getBoundingClientRect().right),
        })),
    };

    expect(edges.composer).not.toBeNull();
    expect(edges.message).not.toBeNull();
    expect(Math.abs(edges.composer!.left - edges.message!.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(edges.composer!.right - edges.message!.right)).toBeLessThanOrEqual(1);
  });

  // Expanding "All models" made the popover taller than the space above its
  // trigger, and it rendered 45px above the viewport with the search field
  // half cut off and no way to scroll it back.
  test('the model picker stays inside the viewport when its roster expands', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Change model' }).click();
    const allModels = page.getByRole('button', { name: /All models/ });
    if (await allModels.count()) await allModels.first().click();

    const box = await page.evaluate(() => {
      const content = document.querySelector('[data-radix-popper-content-wrapper]')
        ?.firstElementChild as HTMLElement | undefined;
      if (!content) return null;
      const r = content.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: window.innerHeight };
    });

    expect(box).not.toBeNull();
    expect(box!.top).toBeGreaterThanOrEqual(0);
    expect(box!.bottom).toBeLessThanOrEqual(box!.viewport);
    await expect(page.getByRole('textbox', { name: 'Search models' })).toBeInViewport();
  });

  test('phone composer keeps model and reasoning controls separate', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/chat');
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 20000 });

    const catalogueResponse = await page.request.get('/api/models/catalogue');
    expect(catalogueResponse.ok()).toBe(true);
    const catalogue = (await catalogueResponse.json()) as {
      models: {
        id: string;
        displayName: string;
        admitted: boolean;
        availability: string;
        temporarilyUnavailable: boolean;
        requiresEnvironment: string | null;
      }[];
    };
    const candidate = catalogue.models.find((entry) => {
      const reasoning = getModelReasoning(entry.id);
      return (
        entry.admitted &&
        entry.availability === 'live' &&
        !entry.temporarilyUnavailable &&
        !entry.requiresEnvironment &&
        reasoning.capable &&
        reasoning.control !== 'none' &&
        (reasoning.supportedEfforts?.length ?? 0) > 0
      );
    });
    expect(candidate, 'the QA plan has no selectable reasoning model').toBeDefined();

    const model = page.getByRole('button', { name: 'Change model' });
    const reasoning = page.getByRole('button', { name: /^Reasoning effort:/ });
    await expect(model).toBeVisible();
    await model.click();
    await page.getByRole('button', { name: /All models/ }).click();
    await page.getByRole('textbox', { name: 'Search models' }).fill(candidate!.displayName);
    await page.getByRole('option', { name: candidate!.displayName, exact: true }).click();
    await expect(reasoning).toBeVisible();

    const modelBox = await model.boundingBox();
    const reasoningBox = await reasoning.boundingBox();
    expect(modelBox).not.toBeNull();
    expect(reasoningBox).not.toBeNull();
    expect(modelBox!.x + modelBox!.width).toBeLessThanOrEqual(reasoningBox!.x);
    expect(reasoningBox!.x + reasoningBox!.width).toBeLessThanOrEqual(360);
  });

  test('the sidebar conversation list stays usable on a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/chat');
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 20000 });

    const scroller = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(
        (n) =>
          n.className.includes('overflow-y-auto') &&
          n.getBoundingClientRect().width < 300 &&
          n.getBoundingClientRect().width > 100,
      );
      if (!el) return null;
      return {
        height: Math.round(el.getBoundingClientRect().height),
        scrollHeight: el.scrollHeight,
      };
    });

    expect(scroller).not.toBeNull();
    expect(scroller!.height).toBeGreaterThan(120);
  });
});
