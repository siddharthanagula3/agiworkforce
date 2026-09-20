import { mockAuthProvider } from './lib/mock-auth-provider';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/login', '/signup'] as const;

const LARGE_TEXT_ROOT_PX = 32;
const MIN_TARGET_PX = 24;

async function openAuth(page: Page, route: string): Promise<void> {
  await mockAuthProvider(page);
  await page.goto(route, { waitUntil: 'load' });
  await expect(page.getByTestId('auth-layout')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
}

test.describe('auth accessibility', () => {
  for (const route of ROUTES) {
    test(`${route} has no serious or critical axe violations`, async ({ page }) => {
      await openAuth(page, route);

      // @axe-core/playwright bundles its own Playwright types, which do not
      // structurally match this repo's. The other specs cast the same way.
      const results = await new AxeBuilder({ page: page as never })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );

      expect(
        blocking.map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes), ${v.help}`),
        `${route} accessibility`,
      ).toEqual([]);
    });

    test(`${route} ties every field error to the field it is about`, async ({ page }) => {
      await openAuth(page, route);

      await page.getByLabel('Email address').fill(`unknown-${Date.now()}@example.invalid`);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByTestId('auth-layout').getByRole('alert')).toBeVisible();

      const email = page.getByLabel('Email address');
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      const describedBy = await email.getAttribute('aria-describedby');
      expect(describedBy, 'the field points at its own error').toBeTruthy();
      await expect(page.locator(`[id="${describedBy}"]`)).toBeVisible();
    });

    test(`${route} keeps its controls usable at OS large-text sizes`, async ({ page }) => {
      await openAuth(page, route);
      await page.addStyleTag({ content: `html { font-size: ${LARGE_TEXT_ROOT_PX}px; }` });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'large text must not push the column sideways').toBeLessThanOrEqual(0);

      for (const name of ['Continue']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
    });

    test(`${route} announces the heading of the step it is on`, async ({ page }) => {
      await openAuth(page, route);

      const region = page.locator('section[aria-labelledby]').first();
      const labelledBy = await region.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      await expect(page.locator(`[id="${labelledBy}"]`)).toHaveRole('heading');
    });
  }

  test('the password reveal control reports its own pressed state', async ({ page }) => {
    await openAuth(page, '/login');

    await page.getByLabel('Email address').fill('password-user@example.invalid');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
