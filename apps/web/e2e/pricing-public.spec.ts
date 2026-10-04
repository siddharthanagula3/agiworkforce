import { expect, test } from '@playwright/test';
import { mockAuthProvider } from './lib/mock-auth-provider';

const WCAG_AA_NORMAL = 4.5;

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
    test(`the selected Annual savings label clears AA in ${theme} mode`, async ({ page }) => {
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
      expect(resting?.fontSize).toBe('11px');
      expect(resting?.ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);

      await annual.hover();
      await expect
        .poll(async () => {
          const m = await measure();
          return m && m.fillAlpha === 1 ? m.ratio : 0;
        })
        .toBeGreaterThanOrEqual(WCAG_AA_NORMAL);

      await page.mouse.move(0, 0);
      await page.getByRole('button', { name: /^Monthly/ }).focus();
      await page.keyboard.press('Tab');
      await expect(annual).toBeFocused();
      await expect
        .poll(async () => {
          const m = await measure();
          return m && m.fillAlpha === 1 ? m.ratio : 0;
        })
        .toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  }
});
