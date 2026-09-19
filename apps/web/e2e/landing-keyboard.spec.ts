import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('landing skip link moves keyboard navigation past the header', async ({ page }) => {
  await page.goto('/');

  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  await expect(page.locator('#main-content')).toHaveCount(1);

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content', exact: true });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(main).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(main.getByRole('link').first()).toBeFocused();
});
