import { expect, test } from '@playwright/test';

test.describe('help collection pages', () => {
  test('a collection listed on /help opens its articles with a way back', async ({ page }) => {
    await page.goto('/help', { waitUntil: 'domcontentloaded' });

    const collectionLink = page.locator('a[href^="/help/collections/"]').first();
    await expect(collectionLink).toBeVisible();
    const label = (await collectionLink.textContent())?.trim() ?? '';
    await collectionLink.click();

    await expect(page).toHaveURL(/\/help\/collections\/[^/?#]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All collections' })).toHaveAttribute(
      'href',
      '/help#collections',
    );
    await expect(page.getByRole('main').locator('a[href^="/help/"]').first()).toBeVisible();
  });

  test('a collection that does not exist is a not-found page', async ({ page }) => {
    const response = await page.goto('/help/collections/no-such-collection', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
  });
});
