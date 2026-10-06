import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1180, height: 757 },
  { width: 390, height: 844 },
]) {
  test.describe(`homepage surface explorer at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('shows one inspectable preview at a time with pointer and keyboard navigation', async ({
      page,
    }) => {
      expect((await page.goto('/'))?.status()).toBe(200);
      const tabs = page.getByRole('tablist', { name: 'The six surfaces' });
      await expect(tabs.getByRole('tab')).toHaveCount(6);
      const panel = page.getByRole('tabpanel');
      await expect(panel).toHaveCount(1);
      await expect(panel.locator('.agi-fl-surface-visual')).toBeVisible();
      await expect(panel.getByRole('link', { name: 'Explore AGI Desktop' })).toHaveAttribute(
        'href',
        '/desktop',
      );
      await tabs.getByRole('tab', { name: 'AGI Web', exact: true }).click();
      await expect(panel.getByRole('link', { name: 'Explore AGI Web' })).toHaveAttribute(
        'href',
        '/web',
      );
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: 'AGI CLI', exact: true })).toBeFocused();
      await expect(panel.getByRole('link', { name: 'Explore AGI CLI' })).toHaveAttribute(
        'href',
        '/cli',
      );
      await page.keyboard.press('End');
      await expect(panel.getByRole('link', { name: 'Explore AGI Mobile' })).toHaveAttribute(
        'href',
        '/mobile',
      );
      await expect(panel).toHaveCount(1);
      const phone = panel.locator('.agi-dev--phone');
      await expect(phone).toBeVisible();
      const phoneWidth = await phone.evaluate((element) => element.getBoundingClientRect().width);
      const panelWidth = await panel.evaluate((element) => element.getBoundingClientRect().width);
      expect(phoneWidth).toBeGreaterThan(0);
      expect(phoneWidth).toBeLessThanOrEqual(panelWidth);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
    });
  });
}
